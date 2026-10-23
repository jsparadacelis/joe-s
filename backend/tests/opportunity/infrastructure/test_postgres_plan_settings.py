"""Plan settings on real Postgres: per-study overrides isolated by RLS."""

from decimal import Decimal

import psycopg
import pytest

from backend.app.audit.infrastructure.postgres_audit_log import PostgresAuditLog
from backend.app.opportunity.application.plan_settings import PlanSettingsService
from backend.app.opportunity.domain.plan import ProjectType, Scale
from backend.app.opportunity.infrastructure.postgres_plan_settings import PostgresPlanSettings
from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"


def a_context(study_id=STUDY_A):
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
    return url


def run(url, study_id, action):
    context = a_context(study_id)
    with study_transaction(url, context) as conn:
        service = PlanSettingsService(PostgresPlanSettings(conn), PostgresAuditLog(conn))
        return action(service, context)


class TestOverrides:
    def test_a_new_study_has_no_overrides_and_gets_the_defaults(self, url):
        plan = run(url, STUDY_A, lambda s, c: s.make_plan(ProjectType.INDUSTRIAL, Scale.LARGE))

        assert plan.weeks == (3, 3, 5, 7, 10, 52, 5)

    def test_saved_template_and_factor_change_the_plan(self, url):
        run(url, STUDY_A, lambda s, c: s.update_template(c, ProjectType.INDUSTRIAL, [10] * 7))
        run(url, STUDY_A, lambda s, c: s.update_scale_factor(c, Scale.LARGE, "1.5"))

        plan = run(url, STUDY_A, lambda s, c: s.make_plan(ProjectType.INDUSTRIAL, Scale.LARGE))

        assert plan.weeks == (15, 15, 15, 15, 15, 15, 15)

    def test_updating_twice_keeps_a_single_row(self, url):
        run(url, STUDY_A, lambda s, c: s.update_template(c, ProjectType.INDUSTRIAL, [1] * 7))
        run(url, STUDY_A, lambda s, c: s.update_template(c, ProjectType.INDUSTRIAL, [2] * 7))

        with psycopg.connect(url) as admin:
            rows = admin.execute("SELECT weeks FROM plan_templates").fetchall()
        assert rows == [([2] * 7,)]

    def test_the_factor_keeps_its_decimals(self, url):
        run(url, STUDY_A, lambda s, c: s.update_scale_factor(c, Scale.SMALL, "0.75"))

        with psycopg.connect(url) as admin:
            rows = admin.execute("SELECT factor FROM scale_factors").fetchall()
        assert rows == [(Decimal("0.75"),)]

    def test_each_change_is_audited(self, url):
        run(url, STUDY_A, lambda s, c: s.update_template(c, ProjectType.INDUSTRIAL, [3] * 7))

        with psycopg.connect(url) as admin:
            rows = admin.execute(
                "SELECT entity, entity_id, action, old_value, new_value FROM audit_events"
            ).fetchall()
        assert rows == [
            (
                "plan_settings",
                "template:industrial",
                "update",
                {"weeks": [2, 2, 4, 5, 8, 40, 4]},
                {"weeks": [3] * 7},
            )
        ]


class TestIsolation:
    def test_another_study_keeps_the_defaults(self, url):
        run(url, STUDY_A, lambda s, c: s.update_template(c, ProjectType.INDUSTRIAL, [30] * 7))

        plan = run(url, STUDY_B, lambda s, c: s.make_plan(ProjectType.INDUSTRIAL, Scale.MEDIUM))

        assert plan.weeks == (2, 2, 4, 5, 8, 40, 4)

    def test_a_study_cannot_write_rows_for_another_study(self, url):
        with study_transaction(url, a_context(STUDY_A)) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute(
                    "INSERT INTO scale_factors (study_id, scale, factor) VALUES (%s, 'small', 1)",
                    (STUDY_B,),
                )


class TestConstraints:
    @pytest.mark.parametrize(
        "statement",
        [
            "INSERT INTO plan_templates (study_id, project_type, weeks) "
            "VALUES (%s, 'industrial', '{1,2,3}')",
            "INSERT INTO plan_templates (study_id, project_type, weeks) "
            "VALUES (%s, 'industrial', '{0,1,1,1,1,1,1}')",
            "INSERT INTO plan_templates (study_id, project_type, weeks) "
            "VALUES (%s, 'castle', '{1,1,1,1,1,1,1}')",
            "INSERT INTO scale_factors (study_id, scale, factor) VALUES (%s, 'small', 0)",
            "INSERT INTO scale_factors (study_id, scale, factor) VALUES (%s, 'huge', 1)",
        ],
    )
    def test_the_database_rejects_invalid_rows(self, url, statement):
        with psycopg.connect(url, autocommit=True) as admin:
            with pytest.raises(psycopg.errors.CheckViolation):
                admin.execute(statement, (STUDY_A,))
