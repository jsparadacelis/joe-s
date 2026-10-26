"""Promote the project from phase 1 (RGB-19): the sheet is complete, gets finalized with its
resolved copy inside, and the promotion service freezes it as version 1 and moves the project.

Only this explicit act changes the phase; the sheet use cases never write it themselves.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any

from backend.app.access.application.actors import decide
from backend.app.access.domain.actions import Action as Permission
from backend.app.audit.application.record import audit
from backend.app.audit.domain.event import Outcome
from backend.app.audit.domain.ports import AuditLog
from backend.app.lifecycle.application.promotion_service import PromotionService, Transition
from backend.app.lifecycle.domain.errors import NoAuthority
from backend.app.opportunity.domain.errors import (
    IncompleteSheet,
    ProjectNotFound,
    PromotionRejected,
    SheetNotEditable,
)
from backend.app.opportunity.domain.ports import ProjectPlans, ProjectSheets
from backend.app.opportunity.domain.project_sheet import (
    SHEET_KEY,
    SHEET_PHASE,
    ProjectSheet,
    SheetPermissions,
    SheetProject,
    build_sheet,
    missing_required_labels,
    sheet_content,
)
from backend.app.study.domain.context import RequestContext


@dataclass(frozen=True)
class PromoteSheetResult:
    sheet: ProjectSheet | None
    transition: Transition | None
    error: Exception | None


class PromoteProjectSheet:
    def __init__(
        self,
        sheets: ProjectSheets,
        plans: ProjectPlans,
        promotion: PromotionService,
        audit_log: AuditLog,
    ) -> None:
        self._sheets = sheets
        self._plans = plans
        self._promotion = promotion
        self._audit_log = audit_log

    def execute(self, context: RequestContext, code: str) -> PromoteSheetResult:
        """Business rejections are returned (and audited); an unknown project is raised.

        Order of checks: project, phase 1, authority, completeness.
        """
        project = self._sheets.get_project(code, lock=True)
        if project is None:
            raise ProjectNotFound(code)
        if project.current_phase != SHEET_PHASE:
            return self._reject(context, project, SheetNotEditable())
        decision = decide(context, Permission.PROMOTE, project.id, SHEET_PHASE)
        if not decision.allowed:
            return self._reject(context, project, NoAuthority(SHEET_PHASE, list(decision.who)))

        stored = self._sheets.get_content(project.id) or {}
        sheet = build_sheet(project=project, plan=self._plans.get(project.id), manual=stored)
        if missing := missing_required_labels(sheet):
            return self._reject(context, project, IncompleteSheet(missing))

        content: dict[str, Any] = {**stored, SHEET_KEY: sheet_content(sheet)}
        self._sheets.finalize_content(project.id, content)
        transition = self._promotion.promote(context, code)
        if not transition.ok:
            # The content is already finalized: raise so the transaction rolls back as a whole.
            raise PromotionRejected(transition.error)

        audit(
            self._audit_log,
            context,
            entity="project_sheet",
            entity_id=code,
            action="freeze",
            old_value={"phase": SHEET_PHASE},
            new_value={"frozen_version": transition.frozen_version},
            version=transition.frozen_version,
        )
        frozen = replace(
            sheet,
            phase=transition.current_phase,
            frozen_version=transition.frozen_version,
            permissions=SheetPermissions(can_edit=False, can_promote=False),
        )
        return PromoteSheetResult(frozen, transition, None)

    def _reject(
        self, context: RequestContext, project: SheetProject, error: Exception
    ) -> PromoteSheetResult:
        audit(
            self._audit_log,
            context,
            entity="project_sheet",
            entity_id=project.code,
            action="promote",
            old_value={"phase": project.current_phase},
            new_value={"error": error.code},  # type: ignore[attr-defined]
            outcome=Outcome.REJECTED,
        )
        return PromoteSheetResult(None, None, error)
