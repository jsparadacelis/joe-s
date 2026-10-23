"""Lifecycle model rules on real Postgres."""

import json

import psycopg
import pytest

from backend.app.lifecycle.domain.phases import PHASES
from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
PROJECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

STUDY_TABLES = [
    "projects",
    "exit_deliverables",
    "frozen_versions",
    "promotions",
    "internal_milestones",
]


def a_context(study_id):
    return RequestContext(study_id=study_id, user_id="demo-user", role=Role.PARTNER)


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
            "INSERT INTO projects (id, study_id, code, name, current_phase) "
            "VALUES (%s, %s, 'PRY-EJ-001', 'House (sample)', 2)",
            (PROJECT_A, STUDY_A),
        )
    return url


def admin_execute(url, sql, params=()):
    with psycopg.connect(url, autocommit=True) as admin:
        return admin.execute(sql, params)


def freeze(url, version=1):
    admin_execute(
        url,
        "INSERT INTO frozen_versions (study_id, project_id, phase, version, content, "
        "frozen_by) VALUES (%s, %s, 2, %s, %s, 'demo-user')",
        (STUDY_A, PROJECT_A, version, json.dumps({"titulo": "Brief (sample)"})),
    )


class TestPhaseConfig:
    def test_matches_the_domain_definitions(self, url):
        with psycopg.connect(url) as conn:
            rows = conn.execute(
                "SELECT id, name, exit_deliverable, authority FROM phase_config ORDER BY id"
            ).fetchall()

        assert rows == [(f.id, f.name, f.exit_deliverable, f.authority) for f in PHASES]

    def test_app_role_can_read_but_not_change_it(self, url):
        with study_transaction(url, a_context(STUDY_A)) as conn:
            count = conn.execute("SELECT count(*) FROM phase_config").fetchone()[0]
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute("UPDATE phase_config SET name = 'x'")

        assert count == 8


class TestSinglePhase:
    def test_phase_is_required(self, url):
        with pytest.raises(psycopg.errors.NotNullViolation):
            admin_execute(
                url,
                "INSERT INTO projects (study_id, code, name, current_phase) "
                "VALUES (%s, 'X', 'X', NULL)",
                (STUDY_A,),
            )

    @pytest.mark.parametrize("phase", [-1, 8])
    def test_phase_must_exist(self, url, phase):
        with pytest.raises(psycopg.errors.ForeignKeyViolation):
            admin_execute(
                url,
                "INSERT INTO projects (study_id, code, name, current_phase) "
                "VALUES (%s, 'X', 'X', %s)",
                (STUDY_A, phase),
            )

    def test_code_is_unique_within_a_study_but_not_across_studies(self, url):
        admin_execute(
            url,
            "INSERT INTO projects (study_id, code, name, current_phase) "
            "VALUES (%s, 'PRY-EJ-001', 'Otro study (sample)', 0)",
            (STUDY_B,),
        )

        with pytest.raises(psycopg.errors.UniqueViolation):
            admin_execute(
                url,
                "INSERT INTO projects (study_id, code, name, current_phase) "
                "VALUES (%s, 'PRY-EJ-001', 'Duplicado', 0)",
                (STUDY_A,),
            )


class TestActive:
    ACTIVATE = (
        "UPDATE projects SET active = true, responsible_id = %s, next_milestone = %s, "
        "traffic_light = %s WHERE id = %s"
    )

    def test_active_without_responsible_milestone_or_traffic_light_is_rejected(self, url):
        with pytest.raises(psycopg.errors.CheckViolation):
            admin_execute(url, "UPDATE projects SET active = true WHERE id = %s", (PROJECT_A,))

    def test_active_with_everything_is_accepted(self, url):
        admin_execute(url, self.ACTIVATE, ("demo-user", "Brief delivery", "green", PROJECT_A))

        active = admin_execute(url, "SELECT active FROM projects").fetchone()[0]
        assert active is True

    def test_cannot_remove_a_required_field_while_active(self, url):
        admin_execute(url, self.ACTIVATE, ("demo-user", "Brief delivery", "green", PROJECT_A))

        with pytest.raises(psycopg.errors.CheckViolation):
            admin_execute(
                url, "UPDATE projects SET next_milestone = NULL WHERE id = %s", (PROJECT_A,)
            )

    def test_traffic_light_only_accepts_known_values(self, url):
        with pytest.raises(psycopg.errors.CheckViolation):
            admin_execute(
                url, "UPDATE projects SET traffic_light = 'azul' WHERE id = %s", (PROJECT_A,)
            )


class TestExitDeliverable:
    INSERT = (
        "INSERT INTO exit_deliverables (study_id, project_id, phase, content, complete, approved) "
        "VALUES (%s, %s, 2, '{}', %s, %s)"
    )

    def test_one_per_project_and_phase(self, url):
        admin_execute(url, self.INSERT, (STUDY_A, PROJECT_A, False, False))

        with pytest.raises(psycopg.errors.UniqueViolation):
            admin_execute(url, self.INSERT, (STUDY_A, PROJECT_A, False, False))

    def test_cannot_be_approved_without_being_complete(self, url):
        with pytest.raises(psycopg.errors.CheckViolation):
            admin_execute(url, self.INSERT, (STUDY_A, PROJECT_A, False, True))

    def test_child_cannot_hang_from_a_project_of_another_study(self, url):
        with pytest.raises(psycopg.errors.ForeignKeyViolation):
            admin_execute(url, self.INSERT, (STUDY_B, PROJECT_A, False, False))


class TestFrozenVersion:
    def test_version_is_unique_per_project_and_phase(self, url):
        freeze(url)

        with pytest.raises(psycopg.errors.UniqueViolation):
            freeze(url)

    @pytest.mark.parametrize(
        "statement",
        ["UPDATE frozen_versions SET content = '{}'", "DELETE FROM frozen_versions"],
    )
    def test_app_role_cannot_modify_or_delete_it(self, url, statement):
        freeze(url)

        with study_transaction(url, a_context(STUDY_A)) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute(statement)

    @pytest.mark.parametrize(
        "statement",
        [
            "UPDATE frozen_versions SET content = '{}'",
            "DELETE FROM frozen_versions",
            "TRUNCATE frozen_versions",
        ],
    )
    def test_not_even_the_owner_can_modify_it(self, url, statement):
        freeze(url)

        with pytest.raises(psycopg.Error, match="immutable"):
            admin_execute(url, statement)


class TestPromotions:
    INSERT = (
        "INSERT INTO promotions (study_id, project_id, action, from_phase, to_phase, user_id, "
        "reason) VALUES (%s, %s, %s, %s, %s, 'demo-user', %s)"
    )

    def test_a_valid_promotion_is_stored_with_who_and_when(self, url):
        admin_execute(url, self.INSERT, (STUDY_A, PROJECT_A, "promote", 2, 3, None))

        row = admin_execute(
            url, "SELECT user_id, outcome, created_at IS NOT NULL FROM promotions"
        ).fetchone()
        assert row == ("demo-user", "ok", True)

    @pytest.mark.parametrize(
        ("action", "from_phase", "to_phase", "reason"),
        [
            ("promote", 2, 4, None),
            ("promote", 2, None, None),
            ("hold", 2, None, None),
            ("hold", 2, None, "  "),
            ("hold", 2, 3, "reason"),
            ("do_not_pursue", 1, None, "reason"),
            ("do_not_pursue", 0, None, None),
            ("unknown", 2, 3, None),
        ],
    )
    def test_invalid_combinations_are_rejected(self, url, action, from_phase, to_phase, reason):
        with pytest.raises(psycopg.errors.CheckViolation):
            admin_execute(
                url, self.INSERT, (STUDY_A, PROJECT_A, action, from_phase, to_phase, reason)
            )

    def test_valid_hold_and_do_not_pursue_are_accepted(self, url):
        admin_execute(
            url, self.INSERT, (STUDY_A, PROJECT_A, "hold", 2, None, "Something is missing")
        )
        admin_execute(url, self.INSERT, (STUDY_A, PROJECT_A, "do_not_pursue", 0, None, "Threshold"))

        count = admin_execute(url, "SELECT count(*) FROM promotions").fetchone()[0]
        assert count == 2

    @pytest.mark.parametrize(
        "statement", ["UPDATE promotions SET reason = 'x'", "DELETE FROM promotions"]
    )
    def test_history_cannot_be_rewritten(self, url, statement):
        admin_execute(url, self.INSERT, (STUDY_A, PROJECT_A, "promote", 2, 3, None))

        with study_transaction(url, a_context(STUDY_A)) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute(statement)
        with pytest.raises(psycopg.Error, match="immutable"):
            admin_execute(url, statement)


class TestInternalMilestones:
    def test_stores_a_milestone_inside_a_phase(self, url):
        admin_execute(
            url,
            "INSERT INTO internal_milestones (study_id, project_id, phase, name) "
            "VALUES (%s, %s, 6, 'License')",
            (STUDY_A, PROJECT_A),
        )

        name = admin_execute(url, "SELECT name FROM internal_milestones").fetchone()[0]
        assert name == "License"


class TestStudyIsolation:
    @pytest.mark.parametrize("table", STUDY_TABLES)
    def test_other_study_sees_nothing(self, url, table):
        admin_execute(
            url,
            "INSERT INTO exit_deliverables (study_id, project_id, phase) VALUES (%s, %s, 2)",
            (STUDY_A, PROJECT_A),
        )
        freeze(url)
        admin_execute(
            url,
            "INSERT INTO promotions (study_id, project_id, action, from_phase, to_phase, user_id) "
            "VALUES (%s, %s, 'promote', 2, 3, 'demo-user')",
            (STUDY_A, PROJECT_A),
        )
        admin_execute(
            url,
            "INSERT INTO internal_milestones (study_id, project_id, phase, name) "
            "VALUES (%s, %s, 6, 'License')",
            (STUDY_A, PROJECT_A),
        )

        with study_transaction(url, a_context(STUDY_B)) as conn:
            count = conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0]

        assert count == 0

    def test_study_cannot_create_a_project_for_another_study(self, url):
        with study_transaction(url, a_context(STUDY_A)) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute(
                    "INSERT INTO projects (study_id, code, name, current_phase) "
                    "VALUES (%s, 'X', 'X', 0)",
                    (STUDY_B,),
                )
