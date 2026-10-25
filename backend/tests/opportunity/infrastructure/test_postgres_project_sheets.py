"""Project sheet reads (RGB-17a) on real Postgres, RLS included.

Names fixed here for the Developer:
- backend.app.opportunity.infrastructure.postgres_project_sheets.PostgresProjectSheets(conn)
  implementing ProjectSheets: get_project(code) -> SheetProject | None (no lock; joins
  opportunities for client, location, project_type; name and traffic_light from projects);
  get_content(project_id) -> dict | None (content of the phase 1 exit deliverable).
- No migration: the sheet lives in exit_deliverables (phase 1, content jsonb).
"""

import psycopg
import pytest

from backend.app.opportunity.domain.plan import ProjectType
from backend.app.opportunity.domain.project_sheet import SheetProject
from backend.app.opportunity.infrastructure.postgres_project_sheets import PostgresProjectSheets
from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
CODE = "PRY-2026-001"


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
        admin.execute(
            "INSERT INTO projects (study_id, code, name, current_phase, traffic_light) VALUES "
            "(%s, %s, 'Warehouse (sample)', 1, 'amber')",
            (STUDY_A, CODE),
        )
        admin.execute(
            "INSERT INTO opportunities (study_id, project_id, client, location, project_type) "
            "SELECT study_id, id, 'Client (sample)', 'Town (sample)', 'industrial' FROM projects"
        )
    return url


def project_id(url):
    with psycopg.connect(url, autocommit=True) as admin:
        return admin.execute("SELECT id::text FROM projects WHERE code = %s", (CODE,)).fetchone()[0]


def save_content(url, phase, content):
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO exit_deliverables (study_id, project_id, phase, content) "
            "SELECT study_id, id, %s, %s::jsonb FROM projects",
            (phase, content),
        )


class TestGetProject:
    def test_returns_the_project_data_the_sheet_is_prefilled_from(self, url):
        with study_transaction(url, a_context()) as conn:
            project = PostgresProjectSheets(conn).get_project(CODE)

        assert project == SheetProject(
            id=project_id(url),
            code=CODE,
            current_phase=1,
            name="Warehouse (sample)",
            client="Client (sample)",
            location="Town (sample)",
            project_type=ProjectType.INDUSTRIAL,
            traffic_light="amber",
        )

    def test_a_project_without_traffic_light_has_none(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute("UPDATE projects SET traffic_light = NULL")

        with study_transaction(url, a_context()) as conn:
            assert PostgresProjectSheets(conn).get_project(CODE).traffic_light is None

    def test_an_unknown_code_is_none(self, url):
        with study_transaction(url, a_context()) as conn:
            assert PostgresProjectSheets(conn).get_project("PRY-2026-999") is None

    def test_another_study_does_not_see_the_project(self, url):
        with study_transaction(url, a_context(STUDY_B)) as conn:
            assert PostgresProjectSheets(conn).get_project(CODE) is None


class TestGetContent:
    def test_returns_the_content_of_the_phase_1_deliverable(self, url):
        save_content(url, 1, '{"sponsor": "Sponsor (sample)"}')

        with study_transaction(url, a_context()) as conn:
            content = PostgresProjectSheets(conn).get_content(project_id(url))

        assert content == {"sponsor": "Sponsor (sample)"}

    def test_ignores_the_deliverables_of_other_phases(self, url):
        save_content(url, 0, '{"plan": {"total": 65}}')

        with study_transaction(url, a_context()) as conn:
            assert PostgresProjectSheets(conn).get_content(project_id(url)) is None

    def test_is_none_without_a_deliverable_row(self, url):
        with study_transaction(url, a_context()) as conn:
            assert PostgresProjectSheets(conn).get_content(project_id(url)) is None

    def test_another_study_does_not_see_the_content(self, url):
        save_content(url, 1, '{"sponsor": "Sponsor (sample)"}')

        with study_transaction(url, a_context(STUDY_B)) as conn:
            assert PostgresProjectSheets(conn).get_content(project_id(url)) is None
