"""Read the technical data of a project: any member of the study, in any phase."""

from __future__ import annotations

from backend.app.study.domain.context import RequestContext
from backend.app.technical_data.application.common import TechnicalDataResult
from backend.app.technical_data.domain.errors import ProjectNotFound
from backend.app.technical_data.domain.ports import TechnicalDataRepository, TechnicalProjects


class GetTechnicalData:
    def __init__(self, projects: TechnicalProjects, data: TechnicalDataRepository) -> None:
        self._projects = projects
        self._data = data

    def execute(self, context: RequestContext, code: str) -> TechnicalDataResult:
        project = self._projects.find(code, lock=False)
        if project is None:
            return TechnicalDataResult(error=ProjectNotFound())
        return TechnicalDataResult(
            sheet=self._data.load(project.id), last_query=self._data.last_query(project.id)
        )
