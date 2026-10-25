"""Postgres adapters of the study context against real Postgres, with RLS."""

import psycopg
import pytest

from backend.app.audit.domain.event import AuditEvent
from backend.app.audit.infrastructure.postgres_audit_log import PostgresAuditLog
from backend.app.shared.db import identity_transaction, study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import Qualification, RequestContext, Role
from backend.app.study.domain.errors import MemberAlreadyExists
from backend.app.study.domain.members import MemberStatus
from backend.app.study.infrastructure.postgres_members import (
    PostgresMemberResolver,
    PostgresMembers,
)

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
SUB = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


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
    return url


def invite(url, study_id, email, role=Role.ARCHITECT, qualifications=frozenset()):
    with study_transaction(url, a_context(study_id)) as conn:
        return PostgresMembers(conn).add(
            study_id=study_id,
            email=email,
            role=role,
            qualifications=qualifications,
            invited_by="demo-user",
        )


class TestPostgresMembers:
    def test_add_returns_an_invited_member(self, url):
        member = invite(
            url,
            STUDY_A,
            "ana@example.com",
            Role.PROJECT_DIRECTOR,
            frozenset({Qualification.SPONSOR}),
        )

        assert member.id
        assert (member.study_id, member.email, member.role, member.status) == (
            STUDY_A,
            "ana@example.com",
            Role.PROJECT_DIRECTOR,
            MemberStatus.INVITED,
        )
        assert member.qualifications == frozenset({Qualification.SPONSOR})
        assert member.user_id is None

    def test_adding_a_duplicate_raises_member_already_exists(self, url):
        invite(url, STUDY_A, "ana@example.com")

        with pytest.raises(MemberAlreadyExists):
            invite(url, STUDY_A, "ana@example.com")

    def test_the_same_email_may_exist_in_another_study(self, url):
        invite(url, STUDY_A, "ana@example.com")

        assert invite(url, STUDY_B, "ana@example.com").study_id == STUDY_B

    def test_find_by_email_and_get(self, url):
        added = invite(url, STUDY_A, "ana@example.com")

        with study_transaction(url, a_context(STUDY_A)) as conn:
            members = PostgresMembers(conn)
            by_email = members.find_by_email("ana@example.com")
            by_id = members.get(added.id)
            missing = members.find_by_email("nobody@example.com")

        assert by_email == added
        assert by_id == added
        assert missing is None

    def test_list_returns_only_the_members_of_the_study(self, url):
        invite(url, STUDY_A, "ana@example.com")
        invite(url, STUDY_A, "bea@example.com")
        invite(url, STUDY_B, "dan@example.com")

        with study_transaction(url, a_context(STUDY_A)) as conn:
            emails = [m.email for m in PostgresMembers(conn).list()]

        assert emails == ["ana@example.com", "bea@example.com"]

    def test_another_study_cannot_see_or_get_a_member(self, url):
        added = invite(url, STUDY_A, "ana@example.com")

        with study_transaction(url, a_context(STUDY_B)) as conn:
            members = PostgresMembers(conn)
            assert members.get(added.id) is None
            assert members.find_by_email("ana@example.com") is None
            assert members.list() == []

    def test_revoke_marks_the_member_revoked(self, url):
        added = invite(url, STUDY_A, "ana@example.com")

        with study_transaction(url, a_context(STUDY_A)) as conn:
            revoked = PostgresMembers(conn).revoke(added.id)

        assert revoked.status is MemberStatus.REVOKED
        with psycopg.connect(url) as admin:
            row = admin.execute(
                "SELECT status, revoked_at IS NOT NULL FROM study_members WHERE id = %s",
                (added.id,),
            ).fetchone()
        assert row == ("revoked", True)

    def test_another_study_cannot_revoke_a_member(self, url):
        added = invite(url, STUDY_A, "ana@example.com")

        with study_transaction(url, a_context(STUDY_B)) as conn:
            result = PostgresMembers(conn).revoke(added.id)

        assert result is None
        with study_transaction(url, a_context(STUDY_A)) as conn:
            assert PostgresMembers(conn).get(added.id).status is MemberStatus.INVITED


class TestPostgresMemberResolver:
    def test_activates_and_returns_the_resolution(self, url):
        invite(url, STUDY_A, "ana@example.com", Role.PARTNER)

        with identity_transaction(url) as conn:
            resolution = PostgresMemberResolver(conn).resolve("ana@example.com", SUB)

        assert resolution.activated is True
        assert (resolution.member.status, resolution.member.user_id) == (MemberStatus.ACTIVE, SUB)
        assert resolution.member.study_id == STUDY_A
        assert resolution.member.role is Role.PARTNER

    def test_a_second_resolution_is_not_an_activation(self, url):
        invite(url, STUDY_A, "ana@example.com")
        with identity_transaction(url) as conn:
            PostgresMemberResolver(conn).resolve("ana@example.com", SUB)

        with identity_transaction(url) as conn:
            resolution = PostgresMemberResolver(conn).resolve("ana@example.com", SUB)

        assert resolution.activated is False

    def test_unknown_email_resolves_to_none(self, url):
        with identity_transaction(url) as conn:
            assert PostgresMemberResolver(conn).resolve("nobody@example.com", SUB) is None

    def test_the_audit_of_the_activation_can_be_written_on_the_same_transaction(self, url):
        added = invite(url, STUDY_A, "ana@example.com")

        with identity_transaction(url) as conn:
            resolution = PostgresMemberResolver(conn).resolve("ana@example.com", SUB)
            PostgresAuditLog(conn).record(
                AuditEvent(
                    study_id=resolution.member.study_id,
                    user_id=SUB,
                    entity="member",
                    entity_id=added.id,
                    action="activate",
                )
            )

        with psycopg.connect(url) as admin:
            rows = admin.execute("SELECT action, user_id FROM audit_events").fetchall()
        assert rows == [("activate", SUB)]

    def test_a_failure_after_resolving_rolls_the_activation_back(self, url):
        added = invite(url, STUDY_A, "ana@example.com")

        with pytest.raises(RuntimeError), identity_transaction(url) as conn:
            PostgresMemberResolver(conn).resolve("ana@example.com", SUB)
            raise RuntimeError("boom")

        with study_transaction(url, a_context(STUDY_A)) as conn:
            member = PostgresMembers(conn).get(added.id)
        assert (member.status, member.user_id) == (MemberStatus.INVITED, None)

    def test_the_identity_transaction_runs_as_the_api_role(self, url):
        with identity_transaction(url) as conn:
            role = conn.execute("SELECT current_user").fetchone()[0]
            visible = conn.execute("SELECT count(*) FROM study_members").fetchone()[0]

        assert (role, visible) == ("rgb_app", 0)
