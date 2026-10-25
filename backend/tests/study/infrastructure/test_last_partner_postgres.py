"""The last active partner cannot be revoked, even by two partners revoking each other at once."""

import threading

import psycopg
import pytest

from backend.app.audit.infrastructure.postgres_audit_log import PostgresAuditLog
from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.application.manage_members import ManageMembers
from backend.app.study.domain.context import RequestContext, Role
from backend.app.study.domain.errors import LastPartner
from backend.app.study.infrastructure.postgres_members import PostgresMembers

pytestmark = pytest.mark.integration

STUDY = "11111111-1111-1111-1111-111111111111"
SUB_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
SUB_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"


def context(sub):
    return RequestContext(study_id=STUDY, user_id=sub, role=Role.PARTNER)


@pytest.fixture
def setup(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute("INSERT INTO studies (id, name) VALUES (%s, 'A (sample)')", (STUDY,))
        admin.execute(
            "INSERT INTO study_members (study_id, email, role, status, user_id, invited_by) "
            "VALUES (%s, 'ana@example.com', 'partner', 'active', %s, 'bootstrap'), "
            "(%s, 'bea@example.com', 'partner', 'active', %s, 'bootstrap'), "
            "(%s, 'cris@example.com', 'architect', 'active', 'sub-c', 'bootstrap')",
            (STUDY, SUB_A, STUDY, SUB_B, STUDY),
        )
        ids = {
            email: row_id
            for email, row_id in admin.execute("SELECT email, id::text FROM study_members")
        }
    return url, ids


def revoke(url, actor_sub, member_id):
    with study_transaction(url, context(actor_sub)) as conn:
        return ManageMembers(PostgresMembers(conn), PostgresAuditLog(conn)).revoke(
            context(actor_sub), member_id
        )


def active_partners(url):
    with psycopg.connect(url) as admin:
        return admin.execute(
            "SELECT count(*) FROM study_members WHERE role = 'partner' AND status = 'active'"
        ).fetchone()[0]


def test_the_only_partner_cannot_be_revoked_not_even_by_themselves(setup):
    url, ids = setup
    revoke(url, SUB_A, ids["bea@example.com"])

    result = revoke(url, SUB_A, ids["ana@example.com"])

    assert isinstance(result.error, LastPartner)
    assert active_partners(url) == 1


def test_the_refusal_is_committed_to_the_audit_log(setup):
    url, ids = setup
    revoke(url, SUB_A, ids["bea@example.com"])
    revoke(url, SUB_A, ids["ana@example.com"])

    with psycopg.connect(url) as admin:
        events = admin.execute(
            "SELECT action, outcome, entity_id FROM audit_events ORDER BY id"
        ).fetchall()
    assert events == [
        ("revoke", "ok", ids["bea@example.com"]),
        ("revoke", "rejected", ids["ana@example.com"]),
    ]


def test_other_members_can_be_revoked_freely(setup):
    url, ids = setup

    assert revoke(url, SUB_A, ids["cris@example.com"]).error is None


def test_two_partners_revoking_each_other_at_once_leave_one_active(setup):
    url, ids = setup
    results = {}
    first_done_revoking = threading.Event()
    release_first = threading.Event()

    def first():
        # Revokes B and holds its transaction open so the second one has to wait on the lock.
        with study_transaction(url, context(SUB_A)) as conn:
            service = ManageMembers(PostgresMembers(conn), PostgresAuditLog(conn))
            results["first"] = service.revoke(context(SUB_A), ids["bea@example.com"])
            first_done_revoking.set()
            release_first.wait(timeout=10)

    def second():
        results["second"] = revoke(url, SUB_B, ids["ana@example.com"])

    t1 = threading.Thread(target=first)
    t1.start()
    assert first_done_revoking.wait(timeout=10)
    t2 = threading.Thread(target=second)
    t2.start()
    t2.join(timeout=1)
    assert t2.is_alive(), "the second revocation must wait for the partners' lock"
    release_first.set()
    t1.join(timeout=10)
    t2.join(timeout=10)

    assert results["first"].error is None
    assert isinstance(results["second"].error, LastPartner)
    assert active_partners(url) == 1


@pytest.mark.parametrize("round_", range(5))
def test_simultaneous_mutual_revocations_never_empty_the_study(setup, round_):
    url, ids = setup
    barrier = threading.Barrier(2)
    results = []

    def run(sub, target):
        barrier.wait(timeout=10)
        results.append(revoke(url, sub, ids[target]))

    threads = [
        threading.Thread(target=run, args=(SUB_A, "bea@example.com")),
        threading.Thread(target=run, args=(SUB_B, "ana@example.com")),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=20)

    assert not any(t.is_alive() for t in threads)
    assert active_partners(url) == 1
    assert sorted(type(r.error).__name__ for r in results) == ["LastPartner", "NoneType"]
