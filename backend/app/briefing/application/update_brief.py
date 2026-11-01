"""Edit the brief (RGB-32): the draft kept in the phase 2 exit deliverable.

Never changes the phase of the project. Only the team writes it: no AI path exists here.
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
from backend.app.briefing.application.view import live_view
from backend.app.briefing.domain.brief import BRIEF_PHASE, ProjectBrief, validate_brief_update
from backend.app.briefing.domain.errors import (
    BriefFieldError,
    BriefNotEditable,
    InvalidBriefRequest,
    ProjectNotFound,
)
from backend.app.briefing.domain.ports import BriefProject, Briefs
from backend.app.lifecycle.domain.errors import NoAuthority
from backend.app.study.domain.context import RequestContext
from backend.app.technical_data.domain.ports import TechnicalDataRepository

ENTITY = "project_brief"
_INPUT_ERRORS = (BriefFieldError, InvalidBriefRequest)


@dataclass(frozen=True)
class UpdateBriefResult:
    brief: ProjectBrief | None
    error: Exception | None


class UpdateBrief:
    def __init__(
        self,
        briefs: Briefs,
        technical: TechnicalDataRepository,
        roles: ProjectRoleReader,
        audit_log: AuditLog,
    ) -> None:
        self._briefs = briefs
        self._technical = technical
        self._roles = roles
        self._audit_log = audit_log

    def execute(self, context: RequestContext, code: str, fields: Any) -> UpdateBriefResult:
        """Business rejections are returned (and audited); only an unknown project is raised.

        Order of checks: project (locked), phase 2, authority, validation.
        """
        project = self._briefs.get_project(code, lock=True)
        if project is None:
            raise ProjectNotFound(code)
        if project.current_phase != BRIEF_PHASE:
            return self._reject(context, project, BriefNotEditable())
        roles = self._roles.roles_of(project.id, context.user_id)
        decision = decide(context, Permission.EDIT_DELIVERABLE, project.id, BRIEF_PHASE, roles)
        if not decision.allowed:
            return self._reject(context, project, NoAuthority(BRIEF_PHASE, list(decision.who)))
        try:
            update = validate_brief_update(fields)
        except _INPUT_ERRORS as error:
            return self._reject(context, project, error)

        stored = self._briefs.get_brief(project.id)
        merged = {**stored, **update}
        merged = {name: value for name, value in merged.items() if value is not None}
        self._briefs.save_brief(project.id, merged)
        audit(
            self._audit_log,
            context,
            entity=ENTITY,
            entity_id=code,
            action="update",
            old_value={name: stored.get(name) for name in update},
            new_value=update,
        )
        view = live_view(
            project,
            merged,
            self._technical.load(project.id),
            self._technical.last_query(project.id),
            authorized=True,  # the editor passed the authority check in phase 2
        )
        return UpdateBriefResult(view, None)

    def _reject(
        self, context: RequestContext, project: BriefProject, error: Exception
    ) -> UpdateBriefResult:
        audit(
            self._audit_log,
            context,
            entity=ENTITY,
            entity_id=project.code,
            action="update",
            old_value={"phase": project.current_phase},
            new_value={"error": error.code},  # type: ignore[attr-defined]
            outcome=Outcome.REJECTED,
        )
        return UpdateBriefResult(None, error)
