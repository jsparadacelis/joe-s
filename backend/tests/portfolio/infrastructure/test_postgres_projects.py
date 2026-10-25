"""Portfolio reads on real Postgres, isolated by RLS."""

from datetime import date, datetime, timezone

import psycopg
import pytest

from backend.app.portfolio.infrastructure.postgres_projects import PostgresProjects
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
        admin.execute(
            "INSERT INTO projects (study_id, code, name, current_phase, paused, traffic_light, "
            "next_milestone, responsible_id, updated_at) VALUES "
            "(%s, 'PRY-2026-002', 'Second (sample)', 3, true, 'red', 'Review (sample)', "
            "'Owner (sample)', '2026-10-01T10:00:00+00'), "
            "(%s, 'PRY-2026-001', 'First (sample)', 0, false, NULL, NULL, NULL, now()), "
            "(%s, 'PRY-2026-001', 'Other studio (sample)', 1, false, NULL, NULL, NULL, now())",
            (STUDY_A, STUDY_A, STUDY_B),
        )
    return url


def test_lists_only_the_projects_of_the_study(url):
    with study_transaction(url, a_context(STUDY_A)) as conn:
        records = PostgresProjects(conn).list_projects()

    assert sorted(r.name for r in records) == ["First (sample)", "Second (sample)"]


def test_maps_every_column(url):
    with study_transaction(url, a_context(STUDY_A)) as conn:
        record = PostgresProjects(conn).find("PRY-2026-002")

    assert record.current_phase == 3
    assert record.paused is True
    assert record.traffic_light == "red"
    assert record.next_milestone == "Review (sample)"
    assert record.responsible_id == "Owner (sample)"
    assert record.updated_at == datetime(2026, 10, 1, 10, 0, tzinfo=timezone.utc)


def test_a_code_of_another_study_is_not_found(url):
    with study_transaction(url, a_context(STUDY_B)) as conn:
        reader = PostgresProjects(conn)

        assert reader.find("PRY-2026-002") is None
        assert reader.find("PRY-2026-001").name == "Other studio (sample)"


def test_unknown_code_is_none(url):
    with study_transaction(url, a_context(STUDY_A)) as conn:
        assert PostgresProjects(conn).find("PRY-2099-001") is None


def _open_pause(admin, reason, expected, resumed_on=None):
    admin.execute(
        "INSERT INTO pauses (study_id, project_id, phase, reason, started_on, "
        "expected_resumption, resumed_on, opened_by, closed_by) "
        "SELECT study_id, id, 3, %s, '2026-09-01', %s, %s, 'x', "
        "CASE WHEN %s::date IS NULL THEN NULL ELSE 'x' END "
        "FROM projects WHERE code = 'PRY-2026-002' AND study_id = %s",
        (reason, expected, resumed_on, resumed_on, STUDY_A),
    )


def test_exposes_the_open_pause_only(url):
    with psycopg.connect(url, autocommit=True) as admin:
        _open_pause(admin, "other", "2026-09-10", "2026-09-05")
        _open_pause(admin, "client_wait", "2026-10-20")

    with study_transaction(url, a_context(STUDY_A)) as conn:
        records = {r.code: r for r in PostgresProjects(conn).list_projects()}
        found = PostgresProjects(conn).find("PRY-2026-002")

    assert records["PRY-2026-002"].pause_reason == "client_wait"
    assert records["PRY-2026-002"].pause_expected_resumption == date(2026, 10, 20)
    assert records["PRY-2026-001"].pause_reason is None
    assert len(records) == 2  # the join never duplicates a project
    assert found.pause_reason == "client_wait"


def test_another_studio_does_not_see_the_pause(url):
    with psycopg.connect(url, autocommit=True) as admin:
        _open_pause(admin, "client_wait", "2026-10-20")

    with study_transaction(url, a_context(STUDY_B)) as conn:
        records = PostgresProjects(conn).list_projects()

    assert [r.pause_reason for r in records] == [None]


def test_project_type_is_none_without_an_opportunity(url):
    with study_transaction(url, a_context(STUDY_A)) as conn:
        record = PostgresProjects(conn).find("PRY-2026-002")

    assert record.project_type is None


def test_project_type_comes_from_the_opportunity(url):
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO opportunities (study_id, project_id, client, location, project_type) "
            "SELECT study_id, id, 'Client (sample)', 'Town (sample)', 'industrial' "
            "FROM projects WHERE code = 'PRY-2026-002'"
        )

    with study_transaction(url, a_context(STUDY_A)) as conn:
        record = PostgresProjects(conn).find("PRY-2026-002")

    assert record.project_type == "industrial"
