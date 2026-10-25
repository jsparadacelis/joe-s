"""Read the project sheet (RGB-17a). Read-only: nothing is saved."""

from __future__ import annotations

from backend.app.opportunity.domain.errors import ProjectNotFound, SheetNotFound
from backend.app.opportunity.domain.ports import ProjectPlans, ProjectSheets
from backend.app.opportunity.domain.project_sheet import ProjectSheet, build_sheet


class GetProjectSheet:
    def __init__(self, sheets: ProjectSheets, plans: ProjectPlans) -> None:
        self._sheets = sheets
        self._plans = plans

    def read(self, code: str) -> ProjectSheet:
        project = self._sheets.get_project(code)
        if project is None:
            raise ProjectNotFound(code)
        if project.current_phase < 1:
            raise SheetNotFound()
        return build_sheet(
            project=project,
            plan=self._plans.get(project.id),
            manual=self._sheets.get_content(project.id),
        )
