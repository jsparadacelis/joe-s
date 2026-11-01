"""Candidates of the "to promote" list on real Postgres: RLS, bulk loading and the data each
phase needs."""

from datetime import date, datetime, timezone

import psycopg
import pytest

from backend.app.access.domain.project_roles import ProjectRole
from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role
from backend.app.to_promote.infrastructure.dev_role_directory import DevRoleDirectory
from backend.app.to_promote.infrastructure.postgres_candidates import PostgresCandidates
from backend.app.to_promote.infrastructure.postgres_role_directory import PostgresRoleDirectory

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
CREATED = "2026-09-01T10:00:00+00"
ENTERED = datetime(2026, 10, 10, 8, 0, tzinfo=timezone.utc)


def a_context(study_id=STUDY_A, user_id="user-1", role=Role.PARTNER):
    return RequestContext(study_id=study_id, user_id=user_id, role=role)


def add_project(admin, study, code, phase, paused=False):
    admin.execute(
        "INSERT INTO projects (study_id, code, name, current_phase, paused, created_at) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (study, code, f"{code} (sample)", phase, paused, CREATED),
    )
    admin.execute(
        "INSERT INTO opportunities (study_id, project_id, client, location, project_type) "
        "SELECT study_id, id, 'Client (sample)', 'Valencia', 'single_family_house' "
        "FROM projects WHERE code = %s AND study_id = %s",
        (code, study),
    )


@pytest.fixture
def url(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO studies (id, name) VALUES (%s, 'A (sample)'), (%s, 'B (sample)')",
            (STUDY_A, STUDY_B),
        )
        add_project(admin, STUDY_A, "P-0", 0)
        add_project(admin, STUDY_A, "P-0S", 0)
        add_project(admin, STUDY_A, "P-0D", 0)
        add_project(admin, STUDY_A, "P-1", 1)
        add_project(admin, STUDY_A, "P-2", 2)
        add_project(admin, STUDY_A, "P-3", 3, paused=True)
        add_project(admin, STUDY_A, "P-7", 7)
        add_project(admin, STUDY_B, "P-B3", 3)
        admin.execute(
            "INSERT INTO opportunity_scorings (study_id, project_id, version, ratings, weights, "
            "threshold, score, recommendation, scored_by) "
            "SELECT study_id, id, 1, '{}', '{}', 60, 70, 'pursue', 'user-1' "
            "FROM projects WHERE code = 'P-0S'"
        )
        admin.execute(
            "INSERT INTO promotions (study_id, project_id, action, from_phase, user_id, reason) "
            "SELECT study_id, id, 'do_not_pursue', 0, 'user-1', 'Reason (sample)' "
            "FROM projects WHERE code = 'P-0D'"
        )
        admin.execute(
            "INSERT INTO promotions (study_id, project_id, action, from_phase, to_phase, "
            "user_id, created_at) SELECT study_id, id, 'promote', 2, 3, 'user-1', %s "
            "FROM projects WHERE code = 'P-3'",
            (ENTERED,),
        )
        admin.execute(
            "INSERT INTO promotions (study_id, project_id, action, from_phase, to_phase, "
            "user_id, outcome) SELECT study_id, id, 'promote', 2, 3, 'user-1', 'rejected' "
            "FROM projects WHERE code = 'P-3'"
        )
        admin.execute(
            "INSERT INTO pauses (study_id, project_id, phase, reason, started_on, "
            "expected_resumption, opened_by) SELECT study_id, id, 3, 'client_wait', "
            "'2026-10-20', '2026-11-20', 'user-1' FROM projects WHERE code = 'P-3'"
        )
        admin.execute(
            "INSERT INTO exit_deliverables (study_id, project_id, phase, content, complete, "
            "approved) SELECT study_id, id, 3, '{\"k\": 1}', true, true FROM projects "
            "WHERE code = 'P-3'"
        )
        admin.execute(
            "INSERT INTO exit_deliverables (study_id, project_id, phase, content) "
            'SELECT study_id, id, 1, \'{"sponsor": "Sponsor (sample)"}\' FROM projects '
            "WHERE code = 'P-1'"
        )
        admin.execute(
            "INSERT INTO exit_deliverables (study_id, project_id, phase, content) "
            'SELECT study_id, id, 2, \'{"brief": {"needs": "N (sample)"}}\' FROM projects '
            "WHERE code = 'P-2'"
        )
        admin.execute(
            "INSERT INTO project_plans (study_id, project_id, project_type, scale, weeks, "
            "confirmed_by) SELECT study_id, id, 'single_family_house', 'medium', "
            "ARRAY[2,3,4,5,6,7,8]::smallint[], 'user-1' FROM projects WHERE code = 'P-1'"
        )
        admin.execute(
            "INSERT INTO technical_data (study_id, project_id, field_id, value, source) "
            "SELECT study_id, id, 'year', '1990', 'manual' FROM projects WHERE code = 'P-2'"
        )
        admin.execute(
            "INSERT INTO technical_data_queries (study_id, project_id, cadastral_reference) "
            "SELECT study_id, id, '00000000000000000000' FROM projects WHERE code = 'P-2'"
        )
    return url


def candidates(url, context=None):
    with study_transaction(url, context or a_context()) as conn:
        return {c.code: c for c in PostgresCandidates(conn).list_candidates()}


def test_lists_the_listable_projects_of_the_study_only(url):
    found = candidates(url)

    assert sorted(found) == ["P-0", "P-0S", "P-1", "P-2", "P-3"]


def test_another_study_sees_none_of_them(url):
    other = candidates(url, a_context(STUDY_B))

    assert sorted(other) == ["P-B3"]


def test_a_study_without_projects_gets_an_empty_list(url):
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO studies (id, name) VALUES ('33333333-3333-3333-3333-333333333333', 'C')"
        )

    assert candidates(url, a_context("33333333-3333-3333-3333-333333333333")) == {}


def test_closing_and_discarded_projects_are_left_out(url):
    found = candidates(url)

    assert "P-7" not in found
    assert "P-0D" not in found


def test_the_phase_zero_scoring_is_flagged(url):
    found = candidates(url)

    assert (found["P-0"].scored, found["P-0S"].scored) == (False, True)


def test_the_open_pause_gives_the_resumption_date(url):
    found = candidates(url)

    assert found["P-3"].paused is True
    assert found["P-3"].expected_resumption == date(2026, 11, 20)
    assert found["P-2"].paused is False
    assert found["P-2"].expected_resumption is None


def test_the_seniority_is_the_last_successful_promotion_into_the_phase(url):
    found = candidates(url)

    assert found["P-3"].in_phase_since == ENTERED


def test_without_a_promotion_the_seniority_is_the_creation_of_the_project(url):
    found = candidates(url)

    assert found["P-0"].in_phase_since == datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)


def test_carries_the_deliverable_of_the_current_phase_only(url):
    found = candidates(url)

    assert found["P-3"].deliverable.complete is True
    assert found["P-3"].deliverable.approved is True
    assert found["P-3"].deliverable.content == {"k": 1}
    assert found["P-0"].deliverable is None
    assert found["P-2"].deliverable.content == {"brief": {"needs": "N (sample)"}}


def test_a_phase_one_project_carries_its_sheet_inputs(url):
    sheet = candidates(url)["P-1"].sheet

    assert sheet.project.name == "P-1 (sample)"
    assert sheet.project.client == "Client (sample)"
    assert sheet.plan.weeks == (2, 3, 4, 5, 6, 7, 8)
    assert sheet.plan.scale.value == "medium"
    assert sheet.stored == {"sponsor": "Sponsor (sample)"}


def test_a_phase_two_project_carries_its_technical_data_and_last_query(url):
    technical = candidates(url)["P-2"].technical

    assert technical.data.get("year").value == "1990"
    assert technical.last_query.cadastral_reference == "00000000000000000000"


def test_only_the_phase_that_needs_them_loads_sheet_and_technical_inputs(url):
    found = candidates(url)

    assert found["P-0"].sheet is None and found["P-0"].technical is None
    assert found["P-3"].sheet is None and found["P-3"].technical is None
    assert found["P-1"].technical is None
    assert found["P-2"].sheet is None


class CountingConnection:
    def __init__(self, conn):
        self._conn = conn
        self.statements = 0

    def execute(self, *args, **kwargs):
        self.statements += 1
        return self._conn.execute(*args, **kwargs)


def test_the_number_of_queries_does_not_grow_with_the_number_of_projects(url):
    with psycopg.connect(url, autocommit=True) as admin:
        for n in range(30):
            add_project(admin, STUDY_A, f"X-{n}", n % 3)

    with study_transaction(url, a_context()) as conn:
        counting = CountingConnection(conn)
        found = PostgresCandidates(counting).list_candidates()

    assert len(found) == 35
    assert counting.statements <= 4


@pytest.fixture
def team(url):
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO study_members (study_id, email, role, status, user_id, invited_by) "
            "VALUES (%s, 'a@example.com', 'architect', 'active', 'user-a', 'x'), "
            "(%s, 'r@example.com', 'architect', 'revoked', 'user-r', 'x')",
            (STUDY_A, STUDY_A),
        )
        for email, role in (("a@example.com", "project_director"), ("r@example.com", "sponsor")):
            admin.execute(
                "INSERT INTO project_members (study_id, project_id, member_id, role, assigned_by)"
                " SELECT p.study_id, p.id, m.id, %s, 'x' FROM projects p, study_members m "
                "WHERE p.code = 'P-2' AND p.study_id = %s AND m.email = %s",
                (role, STUDY_A, email),
            )
        admin.execute(
            "INSERT INTO project_members (study_id, project_id, member_id, role, assigned_by) "
            "SELECT p.study_id, p.id, m.id, 'architect', 'x' FROM projects p, study_members m "
            "WHERE p.code = 'P-1' AND p.study_id = %s AND m.email = 'a@example.com'",
            (STUDY_A,),
        )
    return url


def roles_for(url, user_id, context=None):
    context = context or a_context(user_id=user_id, role=Role.ARCHITECT)
    with study_transaction(url, context) as conn:
        ids = {c.code: c.id for c in PostgresCandidates(conn).list_candidates()}
        by_project = PostgresRoleDirectory(conn).roles_by_project(context, list(ids.values()))
    return {code: by_project.get(pid, frozenset()) for code, pid in ids.items()}


def test_the_roles_of_an_active_member_come_in_one_read(team):
    roles = roles_for(team, "user-a")

    assert roles["P-2"] == {ProjectRole.PROJECT_DIRECTOR}
    assert roles["P-1"] == {ProjectRole.ARCHITECT}
    assert roles["P-3"] == frozenset()


def test_a_revoked_member_holds_nothing(team):
    assert roles_for(team, "user-r")["P-2"] == frozenset()


def test_a_person_who_is_not_a_member_holds_nothing(team):
    assert roles_for(team, "someone-else")["P-2"] == frozenset()


def test_dev_roles_come_from_the_studio_role_for_every_project():
    context = a_context(role=Role.PROJECT_DIRECTOR)

    roles = DevRoleDirectory().roles_by_project(context, ["a", "b"])

    assert roles == {
        "a": frozenset({ProjectRole.PROJECT_DIRECTOR}),
        "b": frozenset({ProjectRole.PROJECT_DIRECTOR}),
    }
