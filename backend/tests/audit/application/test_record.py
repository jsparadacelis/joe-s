from unittest.mock import create_autospec

import pytest

from backend.app.audit.application.record import audit
from backend.app.audit.domain.event import AuditEvent, Outcome
from backend.app.audit.domain.ports import AuditLog
from backend.app.study.domain.context import RequestContext, Role


@pytest.fixture
def log():
    return create_autospec(AuditLog, spec_set=True, instance=True)


@pytest.fixture
def context():
    return RequestContext(study_id="demo-study", user_id="demo-user", role=Role.PARTNER)


class TestAudit:
    def test_registers_an_event_built_from_the_request_context(self, log, context):
        audit(
            log,
            context,
            entity="project",
            entity_id="PRY-EJ-001",
            action="promote",
            old_value={"phase": 2},
            new_value={"phase": 3},
            version=1,
        )

        log.record.assert_called_once_with(
            AuditEvent(
                study_id="demo-study",
                user_id="demo-user",
                entity="project",
                entity_id="PRY-EJ-001",
                action="promote",
                old_value={"phase": 2},
                new_value={"phase": 3},
                version=1,
                outcome=Outcome.OK,
            )
        )

    def test_can_record_a_rejected_attempt(self, log, context):
        audit(
            log,
            context,
            entity="project",
            entity_id="PRY-EJ-001",
            action="promote",
            outcome=Outcome.REJECTED,
        )

        event = log.record.call_args.args[0]
        assert event.outcome is Outcome.REJECTED

    def test_invalid_event_is_not_registered(self, log, context):
        with pytest.raises(ValueError):
            audit(log, context, entity="", entity_id="1", action="promote")

        log.record.assert_not_called()
