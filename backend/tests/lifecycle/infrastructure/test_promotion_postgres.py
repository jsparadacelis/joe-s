"""Promotion service end to end on real Postgres with RLS."""

from unittest.mock import create_autospec

import psycopg
import pytest

from backend.app.audit.domain.ports import AuditLog
from backend.app.audit.infrastructure.postgres_audit_log import PostgresAuditLog
from backend.app.lifecycle.application.promotion_service import PromotionService
from backend.app.lifecycle.domain.errors import ProjectNotFound
from backend.app.lifecycle.infrastructure.postgres_lifecycle import PostgresLifecycle
from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
PROJECT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
CODE = "PRY-EJ-001"


def a_context(study_id=STUDY_A, role=Role.PROJECT_DIRECTOR):
    return RequestContext(study_id=study_id, user_id="demo-user", role=role)


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
            "INSERT INTO projects (id, study_id, code, name, current_phase) "
            "VALUES (%s, %s, %s, 'House (sample)', 2)",
            (PROJECT, STUDY_A, CODE),
        )
        admin.execute(
            "INSERT INTO exit_deliverables (study_id, project_id, phase, content, complete, "
            'approved) VALUES (%s, %s, 2, \'{"titulo": "Brief (sample)"}\', true, true)',
            (STUDY_A, PROJECT),
        )
    return url


def run(url, action, context=None, log=None, **kwargs):
    context = context or a_context()
    with study_transaction(url, context) as conn:
        service = PromotionService(PostgresLifecycle(conn), log or PostgresAuditLog(conn), {})
        return getattr(service, action)(context, CODE, **kwargs)


def query(url, sql):
    with psycopg.connect(url) as admin:
        return admin.execute(sql).fetchall()


class TestPromote:
    def test_moves_freezes_records_opens_and_audits_in_one_go(self, url):
        transition = run(url, "promote")

        assert (transition.ok, transition.current_phase, transition.frozen_version) == (True, 3, 1)
        assert query(url, "SELECT current_phase FROM projects") == [(3,)]
        assert query(url, "SELECT phase, version, content FROM frozen_versions") == [
            (2, 1, {"titulo": "Brief (sample)"})
        ]
        assert query(
            url, "SELECT action, from_phase, to_phase, user_id, outcome FROM promotions"
        ) == [("promote", 2, 3, "demo-user", "ok")]
        assert query(url, "SELECT phase FROM exit_deliverables ORDER BY phase") == [(2,), (3,)]
        assert query(
            url,
            "SELECT action, outcome, version, old_value, new_value FROM audit_events",
        ) == [("promote", "ok", 1, {"phase": 2}, {"phase": 3})]

    def test_the_next_promotion_freezes_the_next_version_of_its_own_phase(self, url):
        run(url, "promote")
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute(
                "UPDATE exit_deliverables SET complete = true, approved = true WHERE phase = 3"
            )

        run(url, "promote")

        assert query(url, "SELECT phase, version FROM frozen_versions ORDER BY phase") == [
            (2, 1),
            (3, 1),
        ]

    def test_promoting_again_the_same_phase_after_a_hold_freezes_version_two(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute(
                "INSERT INTO frozen_versions (study_id, project_id, phase, version, content, "
                "frozen_by) VALUES (%s, %s, 2, 1, '{}', 'demo-user')",
                (STUDY_A, PROJECT),
            )

        transition = run(url, "promote")

        assert transition.frozen_version == 2

    def test_a_failure_halfway_rolls_back_everything(self, url):
        broken = create_autospec(AuditLog, spec_set=True, instance=True)
        broken.record.side_effect = RuntimeError("audit failure")

        with pytest.raises(RuntimeError):
            run(url, "promote", log=broken)

        assert query(url, "SELECT current_phase FROM projects") == [(2,)]
        assert query(url, "SELECT count(*) FROM frozen_versions") == [(0,)]
        assert query(url, "SELECT count(*) FROM promotions") == [(0,)]


class TestRejections:
    def test_without_authority_nothing_changes_but_the_attempt_is_audited(self, url):
        transition = run(url, "promote", a_context(role=Role.ARCHITECT))

        assert transition.ok is False
        assert query(url, "SELECT current_phase FROM projects") == [(2,)]
        assert query(url, "SELECT count(*) FROM frozen_versions") == [(0,)]
        assert query(url, "SELECT action, outcome, new_value FROM audit_events") == [
            ("promote", "rejected", {"error": "no_authority"})
        ]

    def test_incomplete_deliverable_blocks_and_is_audited(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute("UPDATE exit_deliverables SET approved = false")

        transition = run(url, "promote")

        assert transition.error.missing == ["aprobación del entregable"]
        assert query(url, "SELECT current_phase FROM projects") == [(2,)]
        assert query(url, "SELECT outcome FROM audit_events") == [("rejected",)]

    def test_another_study_cannot_see_or_promote_the_project(self, url):
        with pytest.raises(ProjectNotFound):
            run(url, "promote", a_context(study_id=STUDY_B))

        assert query(url, "SELECT current_phase FROM projects") == [(2,)]


class TestHoldAndDoNotPursue:
    def test_hold_records_the_reason_without_moving(self, url):
        transition = run(url, "hold", reason="Missing topographic survey")

        assert transition.ok is True
        assert query(url, "SELECT current_phase FROM projects") == [(2,)]
        assert query(url, "SELECT action, reason, to_phase FROM promotions") == [
            ("hold", "Missing topographic survey", None)
        ]

    def test_do_not_pursue_records_the_decision_from_phase_zero(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute("UPDATE projects SET current_phase = 0")

        transition = run(
            url, "do_not_pursue", a_context(role=Role.PARTNER), reason="Below threshold"
        )

        assert transition.ok is True
        assert query(url, "SELECT action, from_phase, reason FROM promotions") == [
            ("do_not_pursue", 0, "Below threshold")
        ]
