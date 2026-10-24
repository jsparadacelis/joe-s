"""Create an opportunity: a new project in phase 0 plus its captured data, audited."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from backend.app.audit.application.record import audit
from backend.app.audit.domain.ports import AuditLog
from backend.app.opportunity.domain.opportunity import Opportunity
from backend.app.opportunity.domain.ports import OpportunityRepository
from backend.app.study.domain.context import RequestContext

INITIAL_PHASE = 0


@dataclass(frozen=True)
class CreatedOpportunity:
    code: str
    opportunity: Opportunity
    phase: int = INITIAL_PHASE


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CreateOpportunity:
    def __init__(
        self,
        repo: OpportunityRepository,
        audit_log: AuditLog,
        clock: Callable[[], datetime] = _utc_now,
    ) -> None:
        self._repo = repo
        self._audit_log = audit_log
        self._clock = clock

    def execute(self, context: RequestContext, data: Mapping[str, Any]) -> CreatedOpportunity:
        opportunity = Opportunity.from_input(data)
        code = self._repo.next_code(self._clock().astimezone(timezone.utc).year)
        self._repo.add(code, opportunity)
        audit(
            self._audit_log,
            context,
            entity="project",
            entity_id=code,
            action="create_opportunity",
            new_value=_snapshot(opportunity),
        )
        return CreatedOpportunity(code, opportunity)


def _snapshot(opportunity: Opportunity) -> dict[str, Any]:
    budget = opportunity.estimated_budget
    return {
        "phase": INITIAL_PHASE,
        "name": opportunity.name,
        "client": opportunity.client,
        "location": opportunity.location,
        "project_type": opportunity.project_type.value,
        "owner": opportunity.owner,
        "estimated_budget": None if budget is None else str(budget),
        "deadline": opportunity.deadline.isoformat() if opportunity.deadline else None,
        "source": opportunity.source,
        "decision_date": (
            opportunity.decision_date.isoformat() if opportunity.decision_date else None
        ),
    }
