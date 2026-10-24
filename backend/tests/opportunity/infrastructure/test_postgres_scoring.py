"""Scoring on real Postgres: RLS, insert-only history, frozen snapshots, audit, atomicity."""

import threading
from decimal import Decimal

import psycopg
import pytest

from backend.app.audit.infrastructure.postgres_audit_log import PostgresAuditLog
from backend.app.opportunity.application.scoring import ScoringService, ScoringSettingsService
from backend.app.opportunity.domain.errors import InvalidRatings
from backend.app.opportunity.domain.scoring import Criterion, Recommendation
from backend.app.opportunity.infrastructure.postgres_scoring import (
    PostgresScoringSettings,
    PostgresScorings,
)
from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
CODE = "PRY-2026-001"
KEYS = [c.value for c in Criterion]


def a_context(study_id=STUDY_A, user_id="demo-user"):
    return RequestContext(study_id=study_id, user_id=user_id, role=Role.PARTNER)


def ratings(value=3, **overrides):
    data = {key: value for key in KEYS}
    data.update(overrides)
    return data


def weights(value=1, **overrides):
    data = {key: value for key in KEYS}
    data.update(overrides)
    return data


@pytest.fixture
def url(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO studies (id, name) VALUES (%s, 'A (sample)'), (%s, 'B (sample)')",
            (STUDY_A, STUDY_B),
        )
        admin.execute(
            "INSERT INTO projects (study_id, code, name, current_phase) VALUES "
            "(%s, %s, 'Opportunity (sample)', 0), (%s, 'PRY-2026-002', 'House (sample)', 2)",
            (STUDY_A, CODE, STUDY_A),
        )
    return url


def admin_rows(url, sql, params=()):
    with psycopg.connect(url, autocommit=True) as admin:
        return admin.execute(sql, params).fetchall()


def score(url, data=None, code=CODE, study_id=STUDY_A, user_id="demo-user", audit_class=None):
    context = a_context(study_id, user_id)
    with study_transaction(url, context) as conn:
        service = ScoringService(
            PostgresScorings(conn),
            PostgresScoringSettings(conn),
            (audit_class or PostgresAuditLog)(conn),
        )
        return service.score(context, code, {"ratings": data or ratings(3)})


def read(url, code=CODE, study_id=STUDY_A):
    with study_transaction(url, a_context(study_id)) as conn:
        service = ScoringService(
            PostgresScorings(conn), PostgresScoringSettings(conn), PostgresAuditLog(conn)
        )
        return service.read(code)


def update_settings(url, data, study_id=STUDY_A):
    context = a_context(study_id)
    with study_transaction(url, context) as conn:
        ScoringSettingsService(PostgresScoringSettings(conn), PostgresAuditLog(conn)).update(
            context, data
        )


def get_settings(url, study_id=STUDY_A):
    with study_transaction(url, a_context(study_id)) as conn:
        return ScoringSettingsService(
            PostgresScoringSettings(conn), PostgresAuditLog(conn)
        ).get_settings()


class TestSettings:
    def test_a_study_without_rows_gets_the_defaults(self, url):
        settings = get_settings(url)

        assert settings.threshold == 60
        assert set(settings.weights.values()) == {Decimal(1)}
        assert admin_rows(url, "SELECT count(*) FROM scoring_settings") == [(0,)]

    def test_saved_settings_are_read_back(self, url):
        update_settings(url, {"weights": weights(2, budget=0.25), "threshold": 75})

        settings = get_settings(url)

        assert settings.threshold == 75
        assert settings.weights[Criterion.BUDGET] == Decimal("0.25")
        assert settings.weights[Criterion.LOCATION] == Decimal(2)

    def test_saving_again_replaces_and_keeps_one_row_per_study(self, url):
        update_settings(url, {"weights": weights(2), "threshold": 70})
        update_settings(url, {"weights": weights(3), "threshold": 80})

        assert get_settings(url).threshold == 80
        assert admin_rows(url, "SELECT count(*) FROM scoring_settings") == [(1,)]

    def test_each_update_is_audited_with_old_and_new_values(self, url):
        update_settings(url, {"weights": weights(2), "threshold": 70})

        rows = admin_rows(
            url,
            "SELECT study_id::text, user_id, entity, action, outcome, "
            "old_value->>'threshold', new_value->>'threshold' FROM audit_events",
        )
        assert rows == [(STUDY_A, "demo-user", "scoring_settings", "update", "ok", "60", "70")]

    def test_studies_are_isolated(self, url):
        update_settings(url, {"weights": weights(2), "threshold": 70})

        assert get_settings(url, STUDY_B).threshold == 60
        assert get_settings(url, STUDY_A).threshold == 70

    def test_the_database_rejects_out_of_range_values(self, url):
        with pytest.raises(psycopg.errors.CheckViolation):
            with psycopg.connect(url, autocommit=True) as admin:
                admin.execute(
                    "INSERT INTO scoring_settings (study_id, weights, threshold) "
                    "VALUES (%s, '{}', 101)",
                    (STUDY_A,),
                )


class TestScore:
    def test_all_threes_with_default_settings_stores_60_and_pursue(self, url):
        result = score(url)

        assert result.version == 1
        assert result.score == Decimal("60.0")
        assert result.recommendation is Recommendation.PURSUE
        row = admin_rows(
            url,
            "SELECT study_id::text, version, score, recommendation, threshold, scored_by, "
            "ratings->>'client_fit', weights->>'client_fit', scored_at IS NOT NULL "
            "FROM opportunity_scorings",
        )
        assert row == [(STUDY_A, 1, Decimal("60.0"), "pursue", 60, "demo-user", "3", "1", True)]

    def test_versions_grow_per_project(self, url):
        assert [score(url).version for _ in range(3)] == [1, 2, 3]

    def test_each_save_is_audited_in_the_same_transaction(self, url):
        score(url)

        rows = admin_rows(
            url,
            "SELECT study_id::text, user_id, entity, entity_id, action, outcome, version, "
            "new_value->>'score' FROM audit_events",
        )
        assert rows == [
            (STUDY_A, "demo-user", "opportunity_scoring", CODE, "score", "ok", 1, "60.0")
        ]

    def test_nothing_is_stored_if_the_audit_fails(self, url):
        class BrokenAudit:
            def __init__(self, conn):
                pass

            def record(self, event):
                raise RuntimeError("audit down")

        with pytest.raises(RuntimeError):
            score(url, audit_class=BrokenAudit)

        assert admin_rows(url, "SELECT count(*) FROM opportunity_scorings") == [(0,)]

    def test_invalid_ratings_store_nothing(self, url):
        with pytest.raises(InvalidRatings):
            score(url, ratings(3, budget=7))

        assert admin_rows(url, "SELECT count(*) FROM opportunity_scorings") == [(0,)]
        assert admin_rows(url, "SELECT count(*) FROM audit_events") == [(0,)]

    def test_it_does_not_change_the_project_state(self, url):
        before = admin_rows(url, "SELECT code, current_phase, active, paused FROM projects")

        score(url)

        assert admin_rows(url, "SELECT code, current_phase, active, paused FROM projects") == before
        assert admin_rows(url, "SELECT count(*) FROM promotions") == [(0,)]

    def test_concurrent_saves_get_distinct_consecutive_versions(self, url):
        versions, errors = [], []

        def worker():
            try:
                versions.append(score(url).version)
            except Exception as error:  # noqa: BLE001 - reported in the assertion below
                errors.append(error)

        threads = [threading.Thread(target=worker) for _ in range(6)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        assert errors == []
        assert sorted(versions) == [1, 2, 3, 4, 5, 6]


class TestFrozen:
    def test_changing_the_settings_does_not_alter_saved_scorings(self, url):
        first = score(url, ratings(1, client_fit=5))
        update_settings(url, {"weights": weights(1, client_fit=4), "threshold": 90})

        stored = read(url).latest

        assert stored.score == first.score == Decimal("31.4")
        assert stored.threshold == 60
        assert stored.recommendation is Recommendation.DO_NOT_PURSUE
        assert set(stored.weights.values()) == {Decimal(1)}

    def test_a_new_save_uses_the_new_settings_and_the_old_one_is_kept(self, url):
        score(url, ratings(1, client_fit=5))
        update_settings(url, {"weights": weights(1, client_fit=4), "threshold": 10})

        second = score(url, ratings(1, client_fit=5))

        assert second.score == Decimal("52.0")
        assert second.threshold == 10
        assert second.recommendation is Recommendation.PURSUE
        history = read(url).history
        assert [(s.version, s.score) for s in history] == [
            (2, Decimal("52.0")),
            (1, Decimal("31.4")),
        ]

    def test_history_is_in_descending_version_order(self, url):
        for _ in range(3):
            score(url)

        view = read(url)

        assert [s.version for s in view.history] == [3, 2, 1]
        assert view.latest.version == 3


class TestInsertOnly:
    def test_the_app_role_cannot_update_delete_or_truncate(self, url):
        score(url)

        for sql in (
            "UPDATE opportunity_scorings SET score = 100",
            "DELETE FROM opportunity_scorings",
            "TRUNCATE opportunity_scorings",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with study_transaction(url, a_context()) as conn:
                    conn.execute(sql)

    @pytest.mark.parametrize(
        "sql",
        [
            "UPDATE opportunity_scorings SET score = 100",
            "DELETE FROM opportunity_scorings",
            "TRUNCATE opportunity_scorings",
        ],
    )
    def test_not_even_the_owner_can_alter_it(self, url, sql):
        score(url)

        with pytest.raises(psycopg.Error, match="immutable"):
            with psycopg.connect(url, autocommit=True) as admin:
                admin.execute(sql)

        assert admin_rows(url, "SELECT score FROM opportunity_scorings") == [(Decimal("60.0"),)]


class TestRls:
    def test_another_study_neither_sees_nor_scores_the_project(self, url):
        score(url)

        with study_transaction(url, a_context(STUDY_B)) as conn:
            assert conn.execute("SELECT count(*) FROM opportunity_scorings").fetchone() == (0,)
            assert PostgresScorings(conn).get_project(CODE) is None
        with study_transaction(url, a_context(STUDY_A)) as conn:
            assert conn.execute("SELECT count(*) FROM opportunity_scorings").fetchone() == (1,)

    def test_the_app_role_cannot_insert_into_another_study(self, url):
        project_id = admin_rows(url, "SELECT id::text FROM projects WHERE code = %s", (CODE,))[0][0]

        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with study_transaction(url, a_context(STUDY_B)) as conn:
                conn.execute(
                    "INSERT INTO opportunity_scorings (study_id, project_id, version, ratings, "
                    "weights, threshold, score, recommendation, scored_by) VALUES "
                    "(%s, %s, 1, '{}', '{}', 60, 60, 'pursue', 'x')",
                    (STUDY_A, project_id),
                )

    def test_a_scoring_must_belong_to_a_project_of_the_same_study(self, url):
        project_id = admin_rows(url, "SELECT id::text FROM projects WHERE code = %s", (CODE,))[0][0]

        with pytest.raises(psycopg.errors.ForeignKeyViolation):
            with psycopg.connect(url, autocommit=True) as admin:
                admin.execute(
                    "INSERT INTO opportunity_scorings (study_id, project_id, version, ratings, "
                    "weights, threshold, score, recommendation, scored_by) VALUES "
                    "(%s, %s, 1, '{}', '{}', 60, 60, 'pursue', 'x')",
                    (STUDY_B, project_id),
                )

    def test_the_settings_of_another_study_are_invisible(self, url):
        update_settings(url, {"weights": weights(2), "threshold": 70})

        with study_transaction(url, a_context(STUDY_B)) as conn:
            assert conn.execute("SELECT count(*) FROM scoring_settings").fetchone() == (0,)

    def test_both_tables_are_protected_by_forced_rls(self, url):
        assert admin_rows(url, "SELECT * FROM tables_without_rls()") == []


class TestSchemaConstraints:
    def _insert(self, url, **overrides):
        project_id = admin_rows(url, "SELECT id::text FROM projects WHERE code = %s", (CODE,))[0][0]
        values = {
            "version": 1,
            "threshold": 60,
            "score": 60,
            "recommendation": "pursue",
            "scored_by": "x",
            **overrides,
        }
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute(
                "INSERT INTO opportunity_scorings (study_id, project_id, version, ratings, "
                "weights, threshold, score, recommendation, scored_by) "
                "VALUES (%s, %s, %s, '{}', '{}', %s, %s, %s, %s)",
                (
                    STUDY_A,
                    project_id,
                    values["version"],
                    values["threshold"],
                    values["score"],
                    values["recommendation"],
                    values["scored_by"],
                ),
            )

    @pytest.mark.parametrize(
        "overrides",
        [
            {"recommendation": "maybe"},
            {"score": 100.1},
            {"score": -1},
            {"threshold": 0},
            {"threshold": 101},
            {"version": 0},
            {"scored_by": "  "},
        ],
    )
    def test_invalid_rows_are_rejected(self, url, overrides):
        with pytest.raises(psycopg.errors.CheckViolation):
            self._insert(url, **overrides)

    def test_a_version_cannot_repeat_for_a_project(self, url):
        self._insert(url)

        with pytest.raises(psycopg.errors.UniqueViolation):
            self._insert(url)
