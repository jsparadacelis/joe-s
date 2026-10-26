"""Project plans (RGB-16) on real Postgres: migration 009, RLS, insert-only, atomic start.

Names fixed here for the Developer:
- backend/migrations/009_project_plans.sql: table project_plans (study_id, project_id,
  project_type, scale, weeks smallint[] of 7 values 1..520, confirmed_by, confirmed_at), unique
  per project, FK (study_id, project_id) to projects, protect_study_table, REVOKE UPDATE, DELETE,
  TRUNCATE from rgb_app and the reject_alteration trigger ("immutable").
- backend.app.opportunity.infrastructure.postgres_project_plans.PostgresProjectPlans(conn)
  implementing ProjectPlans (see tests/opportunity/application/test_start_project.py).
"""

import threading
from datetime import datetime

import psycopg
import pytest

from backend.app.access.infrastructure.dev_project_roles import DevProjectRoles
from backend.app.audit.infrastructure.postgres_audit_log import PostgresAuditLog
from backend.app.lifecycle.application.promotion_service import PromotionService
from backend.app.lifecycle.infrastructure.postgres_lifecycle import PostgresLifecycle
from backend.app.opportunity.application.plan_settings import PlanSettingsService
from backend.app.opportunity.application.start_project import ProjectPlanReader, StartProject
from backend.app.opportunity.domain.errors import (
    PlanAlreadyConfirmed,
    PlanNotFound,
    ProjectNotFound,
    ProjectNotInOpportunityPhase,
)
from backend.app.opportunity.domain.plan import ProjectType, Scale
from backend.app.opportunity.domain.project_plan import (
    ConfirmedPlan,
    NewProjectPlan,
    StartableProject,
)
from backend.app.opportunity.infrastructure.postgres_plan_settings import PostgresPlanSettings
from backend.app.opportunity.infrastructure.postgres_project_plans import PostgresProjectPlans
from backend.app.opportunity.infrastructure.postgres_scoring import PostgresScorings
from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
CODE = "PRY-2026-001"
WEEKS = (2, 2, 4, 5, 8, 40, 4)


def a_context(study_id=STUDY_A, role=Role.PARTNER, user_id="demo-user"):
    return RequestContext(study_id=study_id, user_id=user_id, role=role)


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
            "(%s, %s, 'Warehouse (sample)', 0)",
            (STUDY_A, CODE),
        )
        admin.execute(
            "INSERT INTO opportunities (study_id, project_id, client, location, project_type) "
            "SELECT study_id, id, 'Client (sample)', 'Town (sample)', 'industrial' FROM projects"
        )
    return url


def admin_rows(url, sql, params=()):
    with psycopg.connect(url, autocommit=True) as admin:
        return admin.execute(sql, params).fetchall()


def project_id(url, code=CODE):
    return admin_rows(url, "SELECT id::text FROM projects WHERE code = %s", (code,))[0][0]


def save_scoring(url):
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO opportunity_scorings (study_id, project_id, version, ratings, weights, "
            "threshold, score, recommendation, scored_by) "
            "SELECT study_id, id, 1, "
            '\'{"client_fit":3,"location":3,"typology":3,"budget":3,"timeline":3,'
            '"source":3,"probability":3}\', '
            '\'{"client_fit":1,"location":1,"typology":1,"budget":1,"timeline":1,'
            "\"source\":1,\"probability\":1}', 60, 60, 'pursue', 'demo-user' FROM projects"
        )


def new_plan(url, weeks=WEEKS, scale=Scale.MEDIUM, study_id=STUDY_A):
    return NewProjectPlan(
        study_id=study_id,
        project_id=project_id(url),
        project_type=ProjectType.INDUSTRIAL,
        scale=scale,
        weeks=tuple(weeks),
        confirmed_by="demo-user",
    )


def add_plan(url, **kwargs):
    with study_transaction(url, a_context()) as conn:
        return PostgresProjectPlans(conn).add(new_plan(url, **kwargs))


class TestGetProject:
    def test_returns_the_project_with_the_data_of_its_opportunity(self, url):
        with study_transaction(url, a_context()) as conn:
            project = PostgresProjectPlans(conn).get_project(CODE)

        assert project == StartableProject(
            id=project_id(url),
            study_id=STUDY_A,
            code=CODE,
            current_phase=0,
            project_type=ProjectType.INDUSTRIAL,
            client="Client (sample)",
            location="Town (sample)",
        )

    def test_an_unknown_code_is_none(self, url):
        with study_transaction(url, a_context()) as conn:
            assert PostgresProjectPlans(conn).get_project("PRY-2026-999") is None

    def test_another_study_does_not_see_the_project(self, url):
        with study_transaction(url, a_context(STUDY_B)) as conn:
            assert PostgresProjectPlans(conn).get_project(CODE) is None

    def test_it_can_read_without_locking(self, url):
        with study_transaction(url, a_context()) as conn:
            assert PostgresProjectPlans(conn).get_project(CODE, lock=False) is not None


class TestAddAndGet:
    def test_stores_the_plan_and_returns_it_with_the_confirmation_time(self, url):
        confirmed = add_plan(url)

        assert isinstance(confirmed, ConfirmedPlan)
        assert confirmed.project_code == CODE
        assert confirmed.project_type is ProjectType.INDUSTRIAL
        assert confirmed.scale is Scale.MEDIUM
        assert confirmed.weeks == WEEKS
        assert confirmed.weeks_by_phase == {1: 2, 2: 2, 3: 4, 4: 5, 5: 8, 6: 40, 7: 4}
        assert confirmed.total == 65
        assert confirmed.confirmed_by == "demo-user"
        assert isinstance(confirmed.confirmed_at, datetime)
        assert admin_rows(
            url,
            "SELECT study_id::text, project_type, scale, weeks, confirmed_by, "
            "confirmed_at IS NOT NULL FROM project_plans",
        ) == [(STUDY_A, "industrial", "medium", list(WEEKS), "demo-user", True)]

    def test_get_returns_what_was_stored(self, url):
        stored = add_plan(url, scale=Scale.LARGE)

        with study_transaction(url, a_context()) as conn:
            assert PostgresProjectPlans(conn).get(project_id(url)) == stored

    def test_get_is_none_while_there_is_no_plan(self, url):
        with study_transaction(url, a_context()) as conn:
            assert PostgresProjectPlans(conn).get(project_id(url)) is None

    def test_a_project_has_one_plan_only(self, url):
        add_plan(url)

        with pytest.raises(psycopg.errors.UniqueViolation):
            add_plan(url, scale=Scale.SMALL)

        assert admin_rows(url, "SELECT count(*) FROM project_plans") == [(1,)]


class TestSaveExitContent:
    def test_creates_the_phase_0_deliverable_complete_and_approved(self, url):
        content = {"plan": {"total": 65}, "scoring": {"score": 60.0}}

        with study_transaction(url, a_context()) as conn:
            PostgresProjectPlans(conn).save_exit_content(project_id(url), content)

        assert admin_rows(
            url, "SELECT phase, content, complete, approved FROM exit_deliverables"
        ) == [(0, content, True, True)]

    def test_replaces_the_content_of_an_existing_deliverable_of_phase_0(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute(
                "INSERT INTO exit_deliverables (study_id, project_id, phase, content) "
                "SELECT study_id, id, 0, '{\"draft\": true}' FROM projects"
            )

        with study_transaction(url, a_context()) as conn:
            PostgresProjectPlans(conn).save_exit_content(project_id(url), {"plan": 1})

        assert admin_rows(url, "SELECT content, complete, approved FROM exit_deliverables") == [
            ({"plan": 1}, True, True)
        ]

    def test_only_touches_phase_0(self, url):
        with study_transaction(url, a_context()) as conn:
            PostgresProjectPlans(conn).save_exit_content(project_id(url), {"plan": 1})

        assert admin_rows(url, "SELECT phase FROM exit_deliverables") == [(0,)]


class TestSchema:
    def _insert(self, url, **overrides):
        values = {
            "project_type": "industrial",
            "scale": "medium",
            "weeks": list(WEEKS),
            "confirmed_by": "demo-user",
            **overrides,
        }
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute(
                "INSERT INTO project_plans (study_id, project_id, project_type, scale, weeks, "
                "confirmed_by) VALUES (%s, %s, %s, %s, %s, %s)",
                (
                    STUDY_A,
                    project_id(url),
                    values["project_type"],
                    values["scale"],
                    values["weeks"],
                    values["confirmed_by"],
                ),
            )

    @pytest.mark.parametrize(
        "overrides",
        [
            {"scale": "huge"},
            {"project_type": "castle"},
            {"weeks": [1, 2, 3, 4, 5, 6]},
            {"weeks": [1, 2, 3, 4, 5, 6, 7, 8]},
            {"weeks": [0, 2, 3, 4, 5, 6, 7]},
            {"weeks": [521, 2, 3, 4, 5, 6, 7]},
            {"weeks": [1, 2, 3, 4, 5, 6, None]},
            {"confirmed_by": "  "},
        ],
    )
    def test_invalid_rows_are_rejected(self, url, overrides):
        with pytest.raises(psycopg.errors.CheckViolation):
            self._insert(url, **overrides)

    def test_the_limits_are_accepted(self, url):
        self._insert(url, weeks=[1, 520, 1, 520, 1, 520, 1])

        assert admin_rows(url, "SELECT count(*) FROM project_plans") == [(1,)]

    def test_a_plan_must_belong_to_a_project_of_the_same_study(self, url):
        with pytest.raises(psycopg.errors.ForeignKeyViolation):
            with psycopg.connect(url, autocommit=True) as admin:
                admin.execute(
                    "INSERT INTO project_plans (study_id, project_id, project_type, scale, "
                    "weeks, confirmed_by) VALUES (%s, %s, 'industrial', 'medium', %s, 'x')",
                    (STUDY_B, project_id(url), list(WEEKS)),
                )


class TestInsertOnly:
    def test_the_app_role_cannot_update_delete_or_truncate(self, url):
        add_plan(url)

        for sql in (
            "UPDATE project_plans SET scale = 'large'",
            "DELETE FROM project_plans",
            "TRUNCATE project_plans",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with study_transaction(url, a_context()) as conn:
                    conn.execute(sql)

    @pytest.mark.parametrize(
        "sql",
        [
            "UPDATE project_plans SET scale = 'large'",
            "DELETE FROM project_plans",
            "TRUNCATE project_plans",
        ],
    )
    def test_not_even_the_owner_can_alter_it(self, url, sql):
        add_plan(url)

        with pytest.raises(psycopg.Error, match="immutable"):
            with psycopg.connect(url, autocommit=True) as admin:
                admin.execute(sql)

        assert admin_rows(url, "SELECT scale FROM project_plans") == [("medium",)]


class TestRls:
    def test_another_study_neither_sees_nor_reads_the_plan(self, url):
        add_plan(url)

        with study_transaction(url, a_context(STUDY_B)) as conn:
            assert conn.execute("SELECT count(*) FROM project_plans").fetchone() == (0,)
            assert PostgresProjectPlans(conn).get(project_id(url)) is None
        with study_transaction(url, a_context(STUDY_A)) as conn:
            assert conn.execute("SELECT count(*) FROM project_plans").fetchone() == (1,)

    def test_the_app_role_cannot_insert_into_another_study(self, url):
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with study_transaction(url, a_context(STUDY_B)) as conn:
                conn.execute(
                    "INSERT INTO project_plans (study_id, project_id, project_type, scale, "
                    "weeks, confirmed_by) VALUES (%s, %s, 'industrial', 'medium', %s, 'x')",
                    (STUDY_A, project_id(url), list(WEEKS)),
                )

    def test_the_table_is_protected_by_forced_rls(self, url):
        assert admin_rows(url, "SELECT * FROM tables_without_rls()") == []


class TestFrozen:
    def test_changing_the_templates_later_does_not_alter_the_confirmed_plan(self, url):
        add_plan(url)

        context = a_context()
        with study_transaction(url, context) as conn:
            PlanSettingsService(PostgresPlanSettings(conn), PostgresAuditLog(conn)).update_template(
                context, ProjectType.INDUSTRIAL, [9, 9, 9, 9, 9, 9, 9]
            )
            PlanSettingsService(
                PostgresPlanSettings(conn), PostgresAuditLog(conn)
            ).update_scale_factor(context, Scale.MEDIUM, 3)

        with study_transaction(url, context) as conn:
            plan = ProjectPlanReader(PostgresProjectPlans(conn)).read(CODE)
        assert plan.weeks == WEEKS
        assert plan.scale is Scale.MEDIUM


class TestReader:
    def test_a_project_without_plan_raises_plan_not_found(self, url):
        with study_transaction(url, a_context()) as conn:
            reader = ProjectPlanReader(PostgresProjectPlans(conn))
            with pytest.raises(PlanNotFound):
                reader.read(CODE)

    def test_another_study_cannot_read_it(self, url):
        add_plan(url)

        with study_transaction(url, a_context(STUDY_B)) as conn:
            with pytest.raises(ProjectNotFound):
                ProjectPlanReader(PostgresProjectPlans(conn)).read(CODE)


def start(url, scale="medium", weeks=WEEKS, context=None, audit_class=None):
    context = context or a_context()
    with study_transaction(url, context) as conn:
        audit_log = (audit_class or PostgresAuditLog)(conn)
        use_case = StartProject(
            PostgresProjectPlans(conn),
            PostgresScorings(conn),
            PromotionService(PostgresLifecycle(conn), audit_log, {}, DevProjectRoles(context)),
            audit_log,
        )
        return use_case.execute(context, CODE, scale, list(weeks))


class TestStartEndToEnd:
    def test_promotes_and_freezes_everything_in_one_transaction(self, url):
        save_scoring(url)

        result = start(url)

        assert result.transition.ok is True
        assert admin_rows(url, "SELECT current_phase FROM projects") == [(1,)]
        assert admin_rows(url, "SELECT scale, weeks FROM project_plans") == [
            ("medium", list(WEEKS))
        ]
        (frozen,) = admin_rows(url, "SELECT phase, version, content FROM frozen_versions")
        assert frozen[:2] == (0, 1)
        assert frozen[2]["plan"] == {
            "project_type": "industrial",
            "scale": "medium",
            "weeks": list(WEEKS),
            "total": 65,
        }
        assert frozen[2]["scoring"]["score"] == 60.0
        assert frozen[2]["scoring"]["threshold"] == 60
        assert frozen[2]["scoring"]["ratings"]["budget"] == 3
        assert frozen[2]["scoring"]["weights"]["budget"] == 1
        assert frozen[2]["project"] == {
            "client": "Client (sample)",
            "location": "Town (sample)",
            "project_type": "industrial",
            "scale": "medium",
        }
        assert admin_rows(url, "SELECT action, from_phase, to_phase FROM promotions") == [
            ("promote", 0, 1)
        ]
        assert admin_rows(url, "SELECT phase FROM exit_deliverables ORDER BY phase") == [
            (0,),
            (1,),
        ]
        assert admin_rows(
            url, "SELECT entity, action, outcome FROM audit_events ORDER BY created_at, id"
        ) == [("project_plan", "confirm", "ok"), ("project", "promote", "ok")]

    def test_nothing_is_stored_if_the_audit_fails(self, url):
        save_scoring(url)

        class BrokenAudit:
            def __init__(self, conn):
                pass

            def record(self, event):
                raise RuntimeError("audit down")

        with pytest.raises(RuntimeError):
            start(url, audit_class=BrokenAudit)

        assert admin_rows(url, "SELECT current_phase FROM projects") == [(0,)]
        assert admin_rows(url, "SELECT count(*) FROM project_plans") == [(0,)]
        assert admin_rows(url, "SELECT count(*) FROM frozen_versions") == [(0,)]
        assert admin_rows(url, "SELECT count(*) FROM exit_deliverables") == [(0,)]

    def test_without_scoring_only_the_rejection_is_audited(self, url):
        result = start(url)

        assert result.transition.ok is False
        assert admin_rows(url, "SELECT current_phase FROM projects") == [(0,)]
        assert admin_rows(url, "SELECT count(*) FROM project_plans") == [(0,)]
        assert admin_rows(url, "SELECT count(*) FROM exit_deliverables") == [(0,)]
        assert admin_rows(url, "SELECT entity, action, outcome, new_value FROM audit_events") == [
            ("project", "start", "rejected", {"error": "incomplete_deliverable"})
        ]

    def test_an_unauthorized_role_stores_nothing(self, url):
        save_scoring(url)

        result = start(url, context=a_context(role=Role.ARCHITECT))

        assert result.transition.error.code == "no_authority"
        assert admin_rows(url, "SELECT count(*) FROM project_plans") == [(0,)]
        assert admin_rows(url, "SELECT count(*) FROM exit_deliverables") == [(0,)]
        assert admin_rows(url, "SELECT current_phase FROM projects") == [(0,)]

    def test_a_second_start_is_rejected(self, url):
        save_scoring(url)
        start(url)

        again = start(url)

        assert isinstance(again.transition.error, ProjectNotInOpportunityPhase)
        assert admin_rows(url, "SELECT count(*) FROM project_plans") == [(1,)]

    def test_a_project_that_already_has_a_plan_is_rejected(self, url):
        save_scoring(url)
        add_plan(url)

        result = start(url)

        assert isinstance(result.transition.error, PlanAlreadyConfirmed)
        assert admin_rows(url, "SELECT current_phase FROM projects") == [(0,)]

    def test_concurrent_starts_promote_only_once(self, url):
        save_scoring(url)
        results, errors = [], []

        def worker():
            try:
                results.append(start(url))
            except Exception as error:  # noqa: BLE001 - reported in the assertion below
                errors.append(error)

        threads = [threading.Thread(target=worker) for _ in range(4)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        assert errors == []
        assert [r.transition.ok for r in results].count(True) == 1
        assert admin_rows(url, "SELECT count(*) FROM project_plans") == [(1,)]
        assert admin_rows(url, "SELECT count(*) FROM frozen_versions") == [(1,)]
        assert admin_rows(url, "SELECT current_phase FROM projects") == [(1,)]
