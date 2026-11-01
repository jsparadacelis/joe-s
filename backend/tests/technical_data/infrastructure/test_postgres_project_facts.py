"""Project facts for the alerts on real Postgres: the sheet's typology and location, blank when
the project has no opportunity, and invisible across studies (RLS)."""

import psycopg
import pytest

from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role
from backend.app.technical_data.domain.alerts import ProjectFacts
from backend.app.technical_data.infrastructure.postgres_project_facts import PostgresProjectFacts

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
WITH_SHEET = "aaaaaaaa-0000-0000-0000-00000000000a"
WITHOUT_SHEET = "aaaaaaaa-0000-0000-0000-00000000000b"
OTHER_STUDY = "bbbbbbbb-0000-0000-0000-00000000000b"
BLANK = ProjectFacts(project_type=None, location=None)


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
            "INSERT INTO projects (id, study_id, code, name, current_phase) VALUES "
            "(%s, %s, 'PRY-T-001', 'One (sample)', 1), (%s, %s, 'PRY-T-002', 'Two (sample)', 1), "
            "(%s, %s, 'PRY-T-003', 'Other (sample)', 1)",
            (WITH_SHEET, STUDY_A, WITHOUT_SHEET, STUDY_A, OTHER_STUDY, STUDY_B),
        )
        admin.execute(
            "INSERT INTO opportunities (study_id, project_id, client, location, project_type) "
            "VALUES (%s, %s, 'Client (sample)', 'Town (sample)', 'multi_family'), "
            "(%s, %s, 'Client (sample)', 'Elsewhere (sample)', 'industrial')",
            (STUDY_A, WITH_SHEET, STUDY_B, OTHER_STUDY),
        )
    return url


def facts_of(url, study_id, project_id):
    context = RequestContext(study_id=study_id, user_id="demo-user", role=Role.PARTNER)
    with study_transaction(url, context) as conn:
        return PostgresProjectFacts(conn).facts_of(project_id)


def test_reads_the_typology_and_location_of_the_sheet(url):
    assert facts_of(url, STUDY_A, WITH_SHEET) == ProjectFacts("multi_family", "Town (sample)")


def test_a_project_without_opportunity_has_blank_facts(url):
    assert facts_of(url, STUDY_A, WITHOUT_SHEET) == BLANK


def test_another_studys_project_is_invisible(url):
    assert facts_of(url, STUDY_A, OTHER_STUDY) == BLANK
