"""`audit()`: the utility services use to leave a trace of every change."""

from __future__ import annotations

from typing import Any

from backend.app.audit.domain.event import AuditEvent, Outcome
from backend.app.audit.domain.ports import AuditLog
from backend.app.study.domain.context import RequestContext


def audit(
    log: AuditLog,
    context: RequestContext,
    *,
    entity: str,
    entity_id: str,
    action: str,
    old_value: Any | None = None,
    new_value: Any | None = None,
    version: int | None = None,
    outcome: Outcome = Outcome.OK,
) -> None:
    log.record(
        AuditEvent(
            study_id=context.study_id,
            user_id=context.user_id,
            entity=entity,
            entity_id=entity_id,
            action=action,
            old_value=old_value,
            new_value=new_value,
            version=version,
            outcome=outcome,
        )
    )
