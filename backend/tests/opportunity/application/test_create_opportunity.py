"""create_opportunity use case with simulated ports."""

from datetime import datetime, timezone
from unittest.mock import create_autospec

import pytest

from backend.app.audit.domain.event import AuditEvent
from backend.app.audit.domain.ports import AuditLog
from backend.app.opportunity.application.create_opportunity import CreateOpportunity
from backend.app.opportunity.domain.errors import OpportunityError
from backend.app.opportunity.domain.opportunity import Opportunity
from backend.app.opportunity.domain.plan import ProjectType
from backend.app.opportunity.domain.ports import OpportunityRepository
from backend.app.study.domain.context import RequestContext, Role

NOW = datetime(2026, 10, 24, 23, 30, tzinfo=timezone.utc)
CONTEXT = RequestContext(
    study_id="11111111-1111-1111-1111-111111111111", user_id="demo-user", role=Role.PARTNER
)


def valid_input(**overrides):
    data = {
        "name": "Warehouse (sample)",
        "client": "Client (sample)",
        "location": "Town (sample)",
        "project_type": "industrial",
        "owner": "Owner (sample)",
    }
    data.update(overrides)
    return data


@pytest.fixture
def repo():
    repo = create_autospec(OpportunityRepository, spec_set=True, instance=True)
    repo.next_code.return_value = "PRY-2026-001"
    return repo


@pytest.fixture
def audit_log():
    return create_autospec(AuditLog, spec_set=True, instance=True)


@pytest.fixture
def use_case(repo, audit_log):
    return CreateOpportunity(repo, audit_log, clock=lambda: NOW)


def test_asks_for_the_code_of_the_current_utc_year_and_stores_the_opportunity(use_case, repo):
    created = use_case.execute(CONTEXT, valid_input())

    repo.next_code.assert_called_once_with(2026)
    code, opportunity = repo.add.call_args.args
    assert code == "PRY-2026-001"
    assert isinstance(opportunity, Opportunity)
    assert opportunity.project_type is ProjectType.INDUSTRIAL
    assert created.code == "PRY-2026-001"
    assert created.opportunity == opportunity
    assert created.phase == 0


def test_the_owner_is_stripped_before_storing(use_case, repo):
    use_case.execute(CONTEXT, valid_input(owner="  Someone (sample) "))

    assert repo.add.call_args.args[1].owner == "Someone (sample)"


def test_audits_who_what_and_the_new_value(use_case, audit_log):
    use_case.execute(CONTEXT, valid_input(estimated_budget=1500.5, deadline="2026-12-31"))

    event = audit_log.record.call_args.args[0]
    assert isinstance(event, AuditEvent)
    assert (event.study_id, event.user_id) == (CONTEXT.study_id, "demo-user")
    assert (event.entity, event.entity_id, event.action) == (
        "project",
        "PRY-2026-001",
        "create_opportunity",
    )
    assert event.old_value is None
    assert event.new_value["phase"] == 0
    assert event.new_value["name"] == "Warehouse (sample)"
    assert event.new_value["project_type"] == "industrial"
    assert event.new_value["estimated_budget"] == "1500.50"
    assert event.new_value["deadline"] == "2026-12-31"


def test_invalid_input_touches_nothing(use_case, repo, audit_log):
    with pytest.raises(OpportunityError):
        use_case.execute(CONTEXT, valid_input(client=""))

    repo.next_code.assert_not_called()
    repo.add.assert_not_called()
    audit_log.record.assert_not_called()


def test_a_failure_storing_does_not_audit(use_case, repo, audit_log):
    repo.add.side_effect = RuntimeError("boom")

    with pytest.raises(RuntimeError):
        use_case.execute(CONTEXT, valid_input())

    audit_log.record.assert_not_called()
