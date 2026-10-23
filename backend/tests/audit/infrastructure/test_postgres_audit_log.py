"""Immutable audit log on real Postgres: insert-only, isolated per study."""

import psycopg
import pytest

from backend.app.audit.domain.event import AuditEvent, Outcome
from backend.app.audit.infrastructure.postgres_audit_log import PostgresAuditLog
from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"


def a_context(study_id):
    return RequestContext(study_id=study_id, user_id="demo-user", role=Role.PARTNER)


def an_event(study_id=STUDY_A, **overrides):
    values = {
        "study_id": study_id,
        "user_id": "demo-user",
        "entity": "project",
        "entity_id": "PRY-EJ-001",
        "action": "promote",
        "old_value": {"phase": 2},
        "new_value": {"phase": 3},
        "version": 1,
    }
    return AuditEvent(**{**values, **overrides})


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


@pytest.fixture
def stored_event(url):
    with study_transaction(url, a_context(STUDY_A)) as conn:
        PostgresAuditLog(conn).record(an_event())
    return url


class TestRecord:
    def test_stores_who_what_when_before_after_version_and_result(self, stored_event):
        with study_transaction(stored_event, a_context(STUDY_A)) as conn:
            row = conn.execute(
                "SELECT study_id::text, user_id, entity, entity_id, action, version, "
                "old_value, new_value, outcome, created_at IS NOT NULL "
                "FROM audit_events"
            ).fetchone()

        assert row == (
            STUDY_A,
            "demo-user",
            "project",
            "PRY-EJ-001",
            "promote",
            1,
            {"phase": 2},
            {"phase": 3},
            "ok",
            True,
        )

    def test_stores_a_rejected_result(self, url):
        with study_transaction(url, a_context(STUDY_A)) as conn:
            PostgresAuditLog(conn).record(an_event(outcome=Outcome.REJECTED))
            result = conn.execute("SELECT outcome FROM audit_events").fetchone()[0]

        assert result == "rejected"

    def test_event_rolls_back_with_the_business_transaction(self, url):
        with pytest.raises(RuntimeError):
            with study_transaction(url, a_context(STUDY_A)) as conn:
                PostgresAuditLog(conn).record(an_event())
                raise RuntimeError("business change failure")

        with psycopg.connect(url) as admin:
            count = admin.execute("SELECT count(*) FROM audit_events").fetchone()[0]
        assert count == 0


class TestImmutable:
    @pytest.mark.parametrize(
        "statement",
        ["UPDATE audit_events SET action = 'otra'", "DELETE FROM audit_events"],
    )
    def test_app_role_cannot_update_or_delete(self, stored_event, statement):
        with study_transaction(stored_event, a_context(STUDY_A)) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute(statement)

    def test_app_role_cannot_truncate(self, stored_event):
        with study_transaction(stored_event, a_context(STUDY_A)) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute("TRUNCATE audit_events")

    @pytest.mark.parametrize(
        "statement",
        [
            "UPDATE audit_events SET action = 'otra'",
            "DELETE FROM audit_events",
            "TRUNCATE audit_events",
        ],
    )
    def test_not_even_the_table_owner_can_alter_events(self, stored_event, statement):
        with psycopg.connect(stored_event) as owner:
            with pytest.raises(psycopg.Error, match="immutable"):
                owner.execute(statement)


class TestIsolation:
    def test_study_does_not_see_events_of_another_study(self, stored_event):
        with study_transaction(stored_event, a_context(STUDY_B)) as conn:
            count = conn.execute("SELECT count(*) FROM audit_events").fetchone()[0]

        assert count == 0

    def test_study_cannot_write_events_for_another_study(self, url):
        with study_transaction(url, a_context(STUDY_A)) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                PostgresAuditLog(conn).record(an_event(study_id=STUDY_B))
