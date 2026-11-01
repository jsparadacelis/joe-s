"""Promote the project from phase 2 to 3 · Anteproyecto (RGB-32).

The brief and the photo of the technical data are finalized together as the deliverable of
phase 2; the promotion service freezes them as one version (1) and moves the project.

Only this explicit act changes the phase; the brief use cases never write it themselves, and no
AI path reaches it.
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
from backend.app.briefing.application.technical_snapshot import obtained, snapshot
from backend.app.briefing.application.view import frozen_view
from backend.app.briefing.domain.brief import (
    BRIEF_KEY,
    BRIEF_PHASE,
    TECHNICAL_DATA_KEY,
    ProjectBrief,
    build_brief,
    completeness,
)
from backend.app.briefing.domain.errors import (
    BriefNotEditable,
    IncompleteBrief,
    ProjectNotFound,
    PromotionRejected,
)
from backend.app.briefing.domain.ports import BriefProject, Briefs
from backend.app.lifecycle.application.promotion_service import PromotionService, Transition
from backend.app.lifecycle.domain.errors import NoAuthority
from backend.app.study.domain.context import RequestContext
from backend.app.technical_data.domain.ports import TechnicalDataRepository

ENTITY = "project_brief"


@dataclass(frozen=True)
class PromoteBriefResult:
    brief: ProjectBrief | None
    transition: Transition | None
    error: Exception | None


class PromoteBrief:
    def __init__(
        self,
        briefs: Briefs,
        technical: TechnicalDataRepository,
        roles: ProjectRoleReader,
        promotion: PromotionService,
        audit_log: AuditLog,
    ) -> None:
        self._briefs = briefs
        self._technical = technical
        self._roles = roles
        self._promotion = promotion
        self._audit_log = audit_log

    def execute(self, context: RequestContext, code: str) -> PromoteBriefResult:
        """Business rejections are returned (and audited); an unknown project is raised.

        Order of checks: project (locked), phase 2, authority, completeness.
        """
        project = self._briefs.get_project(code, lock=True)
        if project is None:
            raise ProjectNotFound(code)
        if project.current_phase != BRIEF_PHASE:
            return self._reject(context, project, BriefNotEditable())
        roles = self._roles.roles_of(project.id, context.user_id)
        decision = decide(context, Permission.PROMOTE, project.id, BRIEF_PHASE, roles)
        if not decision.allowed:
            return self._reject(context, project, NoAuthority(BRIEF_PHASE, list(decision.who)))

        stored = self._briefs.get_brief(project.id)
        data = self._technical.load(project.id)
        query = self._technical.last_query(project.id)
        found = completeness(
            build_brief(stored),
            technical_data_obtained=obtained(data),
            technical_data_queried=query is not None,
        )
        if blockers := found.blockers():
            return self._reject(context, project, IncompleteBrief(blockers))

        content: dict[str, Any] = {BRIEF_KEY: stored, TECHNICAL_DATA_KEY: snapshot(data, query)}
        self._briefs.finalize(project.id, content)
        transition = self._promotion.promote(context, code)
        if not transition.ok:
            # The content is already finalized: raise so the transaction rolls back as a whole.
            raise PromotionRejected(transition.error)

        audit(
            self._audit_log,
            context,
            entity=ENTITY,
            entity_id=code,
            action="freeze",
            old_value={"phase": BRIEF_PHASE},
            new_value={"frozen_version": transition.frozen_version},
            version=transition.frozen_version,
        )
        frozen = frozen_view(
            BriefProject(project.id, project.code, transition.current_phase), content
        )
        return PromoteBriefResult(frozen, transition, None)

    def _reject(
        self, context: RequestContext, project: BriefProject, error: Exception
    ) -> PromoteBriefResult:
        audit(
            self._audit_log,
            context,
            entity=ENTITY,
            entity_id=project.code,
            action="promote",
            old_value={"phase": project.current_phase},
            new_value={"error": error.code},  # type: ignore[attr-defined]
            outcome=Outcome.REJECTED,
        )
        return PromoteBriefResult(None, None, error)
