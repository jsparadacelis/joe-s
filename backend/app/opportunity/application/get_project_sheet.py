"""Read the project sheet (RGB-17a, RGB-19). Read-only: nothing is saved.

In phase 1 the sheet is built live; from phase 2 on the frozen version 1 is returned as it was
(never rebuilt). Permissions are decided here, from the phase, the role and the completion.
"""

from __future__ import annotations

from dataclasses import replace

from backend.app.access.application.actors import decide
from backend.app.access.domain.actions import Action as Permission
from backend.app.opportunity.domain.errors import ProjectNotFound, SheetNotFound
from backend.app.opportunity.domain.ports import ProjectPlans, ProjectSheets
from backend.app.opportunity.domain.project_sheet import (
    FROZEN_SHEET_VERSION,
    SHEET_KEY,
    SHEET_PHASE,
    ProjectSheet,
    SheetPermissions,
    build_sheet,
    sheet_from_content,
    sheet_permissions,
)
from backend.app.study.domain.context import RequestContext


class GetProjectSheet:
    def __init__(self, sheets: ProjectSheets, plans: ProjectPlans) -> None:
        self._sheets = sheets
        self._plans = plans

    def read(self, context: RequestContext, code: str) -> ProjectSheet:
        project = self._sheets.get_project(code)
        if project is None:
            raise ProjectNotFound(code)
        if project.current_phase < SHEET_PHASE:
            raise SheetNotFound()
        if project.current_phase > SHEET_PHASE:
            frozen = self._sheets.get_frozen(project.id, SHEET_PHASE)
            if frozen is not None and SHEET_KEY in frozen:
                return replace(
                    sheet_from_content(frozen[SHEET_KEY]),
                    phase=project.current_phase,
                    frozen_version=FROZEN_SHEET_VERSION,
                    permissions=SheetPermissions(can_edit=False, can_promote=False),
                )
        sheet = build_sheet(
            project=project,
            plan=self._plans.get(project.id),
            manual=self._sheets.get_content(project.id),
        )
        permissions = sheet_permissions(
            phase=project.current_phase,
            authorized=decide(
                context, Permission.PROMOTE, project.id, SHEET_PHASE
            ).allowed,
            completion=sheet.completion,
        )
        return replace(sheet, permissions=permissions)
