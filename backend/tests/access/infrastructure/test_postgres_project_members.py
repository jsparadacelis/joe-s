"""Project assignments against real Postgres: schema, row level security and role lookup."""

import psycopg
import pytest

from backend.app.access.domain.errors import AssignmentAlreadyExists
from backend.app.access.domain.project_roles import ProjectRole
from backend.app.access.infrastructure.postgres_project_members import PostgresProjectMembers
from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
PROJECT_A = "aaaaaaaa-0000-0000-0000-00000000000a"
PROJECT_A2 = "aaaaaaaa-0000-0000-0000-00000000000b"
PROJECT_B = "bbbbbbbb-0000-0000-0000-00000000000b"
MEMBER_A = "aaaaaaaa-1111-1111-1111-111111111111"
MEMBER_B = "bbbbbbbb-1111-1111-1111-111111111111"
SUB_A = "sub-member-a"


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
            "INSERT INTO projects (id, study_id, code, name, current_phase) VALUES "
            "(%s, %s, 'PRY-T-001', 'One (sample)', 2), (%s, %s, 'PRY-T-002', 'Two (sample)', 2), "
            "(%s, %s, 'PRY-T-001', 'Other (sample)', 2)",
            (PROJECT_A, STUDY_A, PROJECT_A2, STUDY_A, PROJECT_B, STUDY_B),
        )
        admin.execute(
            "INSERT INTO study_members (id, study_id, email, role, status, user_id, invited_by) "
            "VALUES (%s, %s, 'a@example.com', 'architect', 'active', %s, 'seed'), "
            "(%s, %s, 'b@example.com', 'architect', 'active', 'sub-member-b', 'seed')",
            (MEMBER_A, STUDY_A, SUB_A, MEMBER_B, STUDY_B),
        )
    return url


def assign(url, study_id, project_id, member_id, role=ProjectRole.ARCHITECT):
    with study_transaction(url, a_context(study_id)) as conn:
        return PostgresProjectMembers(conn).add(
            study_id=study_id,
            project_id=project_id,
            member_id=member_id,
            role=role,
            assigned_by="demo-user",
        )


def test_an_assignment_is_stored_and_listed(url):
    created = assign(url, STUDY_A, PROJECT_A, MEMBER_A, ProjectRole.PROJECT_DIRECTOR)

    with study_transaction(url, a_context(STUDY_A)) as conn:
        listed = PostgresProjectMembers(conn).list_for_project(PROJECT_A)

    assert listed == [created]
    assert created.role is ProjectRole.PROJECT_DIRECTOR
    assert created.member_id == MEMBER_A


def test_the_same_function_cannot_be_assigned_twice(url):
    assign(url, STUDY_A, PROJECT_A, MEMBER_A)

    with pytest.raises(AssignmentAlreadyExists):
        assign(url, STUDY_A, PROJECT_A, MEMBER_A)


def test_one_person_can_hold_several_functions_in_a_project(url):
    assign(url, STUDY_A, PROJECT_A, MEMBER_A, ProjectRole.ARCHITECT)
    assign(url, STUDY_A, PROJECT_A, MEMBER_A, ProjectRole.SPONSOR)

    with study_transaction(url, a_context(STUDY_A)) as conn:
        roles = PostgresProjectMembers(conn).roles_of(PROJECT_A, SUB_A)

    assert roles == frozenset({ProjectRole.ARCHITECT, ProjectRole.SPONSOR})


def test_roles_are_per_project(url):
    assign(url, STUDY_A, PROJECT_A, MEMBER_A, ProjectRole.PROJECT_DIRECTOR)

    with study_transaction(url, a_context(STUDY_A)) as conn:
        elsewhere = PostgresProjectMembers(conn).roles_of(PROJECT_A2, SUB_A)

    assert elsewhere == frozenset()


def test_a_revoked_member_keeps_no_roles(url):
    assign(url, STUDY_A, PROJECT_A, MEMBER_A, ProjectRole.PROJECT_DIRECTOR)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute("UPDATE study_members SET status = 'revoked' WHERE id = %s", (MEMBER_A,))

    with study_transaction(url, a_context(STUDY_A)) as conn:
        roles = PostgresProjectMembers(conn).roles_of(PROJECT_A, SUB_A)

    assert roles == frozenset()


def test_a_person_without_assignments_has_no_roles(url):
    with study_transaction(url, a_context(STUDY_A)) as conn:
        assert PostgresProjectMembers(conn).roles_of(PROJECT_A, "someone-else") == frozenset()


def test_an_assignment_is_removed(url):
    created = assign(url, STUDY_A, PROJECT_A, MEMBER_A)

    with study_transaction(url, a_context(STUDY_A)) as conn:
        removed = PostgresProjectMembers(conn).remove(PROJECT_A, created.id)
        remaining = PostgresProjectMembers(conn).list_for_project(PROJECT_A)

    assert removed == created
    assert remaining == []


def test_removing_an_unknown_assignment_returns_none(url):
    with study_transaction(url, a_context(STUDY_A)) as conn:
        assert (
            PostgresProjectMembers(conn).remove(PROJECT_A, "cccccccc-0000-0000-0000-000000000000")
            is None
        )


def test_studies_do_not_see_each_others_assignments(url):
    assign(url, STUDY_A, PROJECT_A, MEMBER_A)

    with study_transaction(url, a_context(STUDY_B)) as conn:
        assert PostgresProjectMembers(conn).list_for_project(PROJECT_A) == []


def test_an_assignment_cannot_cross_studies(url):
    """A project of study A cannot be given a member of study B, even bypassing the app."""
    with psycopg.connect(url, autocommit=True) as admin:
        with pytest.raises(psycopg.errors.ForeignKeyViolation):
            admin.execute(
                "INSERT INTO project_members (study_id, project_id, member_id, role, assigned_by) "
                "VALUES (%s, %s, %s, 'architect', 'seed')",
                (STUDY_A, PROJECT_A, MEMBER_B),
            )


def test_an_unknown_function_is_rejected_by_the_schema(url):
    with psycopg.connect(url, autocommit=True) as admin:
        with pytest.raises(psycopg.errors.CheckViolation):
            admin.execute(
                "INSERT INTO project_members (study_id, project_id, member_id, role, assigned_by) "
                "VALUES (%s, %s, %s, 'ai_agent', 'seed')",
                (STUDY_A, PROJECT_A, MEMBER_A),
            )


def test_the_table_is_protected_by_row_level_security(url):
    with psycopg.connect(url, autocommit=True) as admin:
        unprotected = [r[0] for r in admin.execute("SELECT * FROM tables_without_rls()")]

    assert "project_members" not in unprotected
