"""Assigning a function in a project changes who can promote it, on real Postgres with RLS."""

import psycopg
import pytest

from backend.app.access.application.manage_project_members import ManageProjectMembers
from backend.app.access.domain.project_roles import ProjectRole
from backend.app.access.infrastructure.postgres_project_directory import PostgresProjectDirectory
from backend.app.access.infrastructure.postgres_project_members import PostgresProjectMembers
from backend.app.audit.infrastructure.postgres_audit_log import PostgresAuditLog
from backend.app.lifecycle.application.promotion_service import PromotionService
from backend.app.lifecycle.domain.errors import NoAuthority
from backend.app.lifecycle.infrastructure.postgres_lifecycle import PostgresLifecycle
from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role
from backend.app.study.infrastructure.postgres_members import PostgresMembers

pytestmark = pytest.mark.integration

STUDY = "11111111-1111-1111-1111-111111111111"
PROJECT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
OTHER_PROJECT = "aaaaaaaa-aaaa-aaaa-aaaa-bbbbbbbbbbbb"
MEMBER = "cccccccc-cccc-cccc-cccc-cccccccccccc"
CODE = "PRY-EJ-001"
OTHER_CODE = "PRY-EJ-002"
SUB = "sub-ana"


def partner():
    return RequestContext(STUDY, "partner-1", Role.PARTNER)


def ana():
    """A project director of the studio, who directs only the projects assigned to her."""
    return RequestContext(STUDY, SUB, Role.PROJECT_DIRECTOR)


@pytest.fixture
def url(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute("INSERT INTO studies (id, name) VALUES (%s, 'A (sample)')", (STUDY,))
        for project, code in ((PROJECT, CODE), (OTHER_PROJECT, OTHER_CODE)):
            admin.execute(
                "INSERT INTO projects (id, study_id, code, name, current_phase) "
                "VALUES (%s, %s, %s, 'House (sample)', 2)",
                (project, STUDY, code),
            )
            admin.execute(
                "INSERT INTO exit_deliverables (study_id, project_id, phase, content, complete, "
                "approved) VALUES (%s, %s, 2, '{\"titulo\": \"Brief (sample)\"}', true, true)",
                (STUDY, project),
            )
        admin.execute(
            "INSERT INTO study_members (id, study_id, email, role, status, user_id, invited_by) "
            "VALUES (%s, %s, 'ana@example.com', 'project_director', 'active', %s, 'seed')",
            (MEMBER, STUDY, SUB),
        )
    return url


def assign(url, context, code, role):
    with study_transaction(url, context) as conn:
        return ManageProjectMembers(
            PostgresProjectDirectory(conn),
            PostgresProjectMembers(conn),
            PostgresMembers(conn),
            PostgresAuditLog(conn),
        ).assign(context, code, MEMBER, role)


def promote(url, context, code):
    with study_transaction(url, context) as conn:
        return PromotionService(
            PostgresLifecycle(conn),
            PostgresAuditLog(conn),
            {},
            PostgresProjectMembers(conn),
        ).promote(context, code)


def audit_rows(url):
    with psycopg.connect(url) as admin:
        return admin.execute(
            "SELECT entity, action, outcome FROM audit_events ORDER BY created_at, id"
        ).fetchall()


def test_a_project_director_without_the_function_is_refused_and_audited(url):
    result = promote(url, ana(), CODE)

    assert isinstance(result.error, NoAuthority)
    assert audit_rows(url) == [("project", "promote", "rejected")]


def test_assigning_the_function_lets_her_promote_that_project_only(url):
    assert assign(url, partner(), CODE, ProjectRole.PROJECT_DIRECTOR).error is None

    assert promote(url, ana(), CODE).ok is True
    assert isinstance(promote(url, ana(), OTHER_CODE).error, NoAuthority)


def test_removing_the_function_takes_the_authority_back(url):
    assignment = assign(url, partner(), CODE, ProjectRole.PROJECT_DIRECTOR).assignment
    with study_transaction(url, partner()) as conn:
        ManageProjectMembers(
            PostgresProjectDirectory(conn),
            PostgresProjectMembers(conn),
            PostgresMembers(conn),
            PostgresAuditLog(conn),
        ).unassign(partner(), CODE, assignment.id)

    assert isinstance(promote(url, ana(), CODE).error, NoAuthority)


def test_a_revoked_member_loses_the_function(url):
    assign(url, partner(), CODE, ProjectRole.PROJECT_DIRECTOR)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute("UPDATE study_members SET status = 'revoked' WHERE id = %s", (MEMBER,))

    assert isinstance(promote(url, ana(), CODE).error, NoAuthority)


def test_the_partner_does_not_inherit_the_project_functions(url):
    assert isinstance(promote(url, partner(), CODE).error, NoAuthority)


def test_assignments_and_removals_are_audited(url):
    assignment = assign(url, partner(), CODE, ProjectRole.ARCHITECT).assignment
    with study_transaction(url, partner()) as conn:
        ManageProjectMembers(
            PostgresProjectDirectory(conn),
            PostgresProjectMembers(conn),
            PostgresMembers(conn),
            PostgresAuditLog(conn),
        ).unassign(partner(), CODE, assignment.id)

    assert audit_rows(url) == [
        ("project_member", "assign", "ok"),
        ("project_member", "unassign", "ok"),
    ]
