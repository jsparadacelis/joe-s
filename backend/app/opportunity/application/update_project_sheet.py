"""Edit the project sheet (RGB-17b): fields and recalculated plan of the phase 1 content.

Never changes the phase of the project and never touches the baseline plan.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.app.audit.application.record import audit
from backend.app.audit.domain.event import Outcome
from backend.app.audit.domain.ports import AuditLog
from backend.app.lifecycle.domain.authority import has_authority, who_can
from backend.app.lifecycle.domain.errors import NoAuthority
from backend.app.lifecycle.domain.phases import phase_definition
from backend.app.opportunity.domain.errors import (
    InvalidProjectType,
    InvalidScale,
    InvalidSheetRequest,
    InvalidWeeks,
    ProjectNotFound,
    SheetFieldError,
    SheetNotEditable,
)
from backend.app.opportunity.domain.ports import ProjectPlans, ProjectSheets
from backend.app.opportunity.domain.project_plan import ConfirmedPlan, ProposedPlan
from backend.app.opportunity.domain.project_sheet import (
    PLAN_KEY,
    ProjectSheet,
    SheetProject,
    build_sheet,
    plan_content,
    validate_sheet_update,
)
from backend.app.study.domain.context import RequestContext

EDITABLE_PHASE = 1
_INPUT_ERRORS = (
    SheetFieldError,
    InvalidSheetRequest,
    InvalidProjectType,
    InvalidScale,
    InvalidWeeks,
)


@dataclass(frozen=True)
class UpdateSheetResult:
    sheet: ProjectSheet | None
    error: Exception | None


def _baseline_content(baseline: ConfirmedPlan | None) -> dict[str, Any] | None:
    if baseline is None:
        return None
    return plan_content(ProposedPlan(baseline.project_type, baseline.scale, baseline.weeks))


class UpdateProjectSheet:
    def __init__(self, sheets: ProjectSheets, plans: ProjectPlans, audit_log: AuditLog) -> None:
        self._sheets = sheets
        self._plans = plans
        self._audit_log = audit_log

    def execute(
        self, context: RequestContext, code: str, fields: Any, plan: Any
    ) -> UpdateSheetResult:
        """Business rejections are returned (and audited); only an unknown project is raised.

        Order of checks: project, phase 1, authority, validation.
        """
        project = self._sheets.get_project(code)
        if project is None:
            raise ProjectNotFound(code)
        if project.current_phase != EDITABLE_PHASE:
            return self._reject(context, project, SheetNotEditable())
        authority = phase_definition(EDITABLE_PHASE).authority
        if not has_authority(authority, context):
            return self._reject(context, project, NoAuthority(EDITABLE_PHASE, who_can(authority)))
        try:
            update = validate_sheet_update(fields, plan)
        except _INPUT_ERRORS as error:
            return self._reject(context, project, error)

        stored = self._sheets.get_content(project.id) or {}
        baseline = self._plans.get(project.id)
        patch: dict[str, Any] = dict(update.fields)
        if update.plan is not None:
            patch[PLAN_KEY] = plan_content(update.plan)
        self._sheets.save_content(project.id, patch)

        if update.fields:
            self._record(
                context,
                code,
                "update",
                {name: stored.get(name) for name in update.fields},
                dict(update.fields),
            )
        if update.plan is not None:
            self._record(
                context,
                code,
                "recalculate_plan",
                stored.get(PLAN_KEY) or _baseline_content(baseline),
                patch[PLAN_KEY],
            )

        merged = {**stored, **patch}
        merged = {name: value for name, value in merged.items() if value is not None}
        return UpdateSheetResult(build_sheet(project=project, plan=baseline, manual=merged), None)

    def _record(self, context: RequestContext, code: str, action: str, old: Any, new: Any) -> None:
        audit(
            self._audit_log,
            context,
            entity="project_sheet",
            entity_id=code,
            action=action,
            old_value=old,
            new_value=new,
        )

    def _reject(
        self, context: RequestContext, project: SheetProject, error: Exception
    ) -> UpdateSheetResult:
        audit(
            self._audit_log,
            context,
            entity="project_sheet",
            entity_id=project.code,
            action="update",
            old_value={"phase": project.current_phase},
            new_value={"error": error.code},  # type: ignore[attr-defined]
            outcome=Outcome.REJECTED,
        )
        return UpdateSheetResult(None, error)
