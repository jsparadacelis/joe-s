"""What every technical data write shares: find the project, check the person's authority and
the phase, and leave a trace of the change or of the refusal.

Refusals are returned (not raised), so the transaction commits and a refused attempt stays in
the audit log.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.app.access.application.actors import decide
from backend.app.access.domain.actions import Action as Permission
from backend.app.access.domain.ports import ProjectRoleReader
from backend.app.audit.application.record import audit
from backend.app.audit.domain.event import Outcome
from backend.app.audit.domain.ports import AuditLog
from backend.app.lifecycle.domain.errors import NoAuthority
from backend.app.study.domain.context import RequestContext
from backend.app.technical_data.domain.errors import (
    ProjectNotFound,
    TechnicalDataNotEditable,
)
from backend.app.technical_data.domain.ports import (
    QueryRecord,
    TechnicalDataRepository,
    TechnicalProject,
    TechnicalProjects,
)
from backend.app.technical_data.domain.technical_data import TechnicalData
from backend.app.technical_data.domain.values import MAX_TEXT_LENGTH

ENTITY_DATUM = "technical_datum"
ENTITY_SHEET = "technical_data"
# The data are filled in during the Briefing, phase 2, and are frozen when the project leaves it.
EDITABLE_PHASE = 2


@dataclass(frozen=True)
class TechnicalDataResult:
    sheet: TechnicalData | None = None
    last_query: QueryRecord | None = None
    # Fields the Catastro gave no usable value for (a refresh only).
    unmapped: tuple[str, ...] = ()
    # Origins that could not be consulted (a refresh only): their data stayed as they were.
    unavailable: tuple[str, ...] = ()
    error: Exception | None = None


def clip(value: Any) -> Any:
    """Keep a rejected input in the audit log without letting it grow without bound."""
    return (value if isinstance(value, str) else repr(value))[:MAX_TEXT_LENGTH]


class SheetWriter:
    def __init__(
        self,
        projects: TechnicalProjects,
        data: TechnicalDataRepository,
        roles: ProjectRoleReader,
        audit_log: AuditLog,
    ) -> None:
        self._projects = projects
        self._data = data
        self._roles = roles
        self._audit_log = audit_log

    def admit(
        self,
        context: RequestContext,
        code: str,
        *,
        entity: str,
        entity_id: str,
        action: str,
        asked: dict[str, Any] | None = None,
    ) -> tuple[TechnicalProject | None, TechnicalDataResult | None]:
        """The project (locked) when the person may change its data now, else the refusal.

        Authority is asked first, as of the Briefing phase, so it never depends on the phase the
        project happens to be in; then the phase.
        """
        project = self._projects.find(code, lock=True)
        if project is None:
            return None, TechnicalDataResult(error=ProjectNotFound())
        roles = self._roles.roles_of(project.id, context.user_id)
        decision = decide(context, Permission.EDIT_DELIVERABLE, project.id, EDITABLE_PHASE, roles)
        if not decision.allowed:
            error: Exception = NoAuthority(EDITABLE_PHASE, list(decision.who))
        elif project.phase != EDITABLE_PHASE:
            error = TechnicalDataNotEditable()
        else:
            return project, None
        return None, self.reject(
            context, error, entity=entity, entity_id=entity_id, action=action, asked=asked
        )

    def reject(
        self,
        context: RequestContext,
        error: Exception,
        *,
        entity: str,
        entity_id: str,
        action: str,
        asked: dict[str, Any] | None = None,
    ) -> TechnicalDataResult:
        audit(
            self._audit_log,
            context,
            entity=entity,
            entity_id=entity_id,
            action=action,
            new_value={**(asked or {}), "error": error.code},  # type: ignore[attr-defined]
            outcome=Outcome.REJECTED,
        )
        return TechnicalDataResult(error=error)

    def record(
        self,
        context: RequestContext,
        *,
        entity: str,
        entity_id: str,
        action: str,
        old_value: Any,
        new_value: Any,
    ) -> None:
        audit(
            self._audit_log,
            context,
            entity=entity,
            entity_id=entity_id,
            action=action,
            old_value=old_value,
            new_value=new_value,
        )
