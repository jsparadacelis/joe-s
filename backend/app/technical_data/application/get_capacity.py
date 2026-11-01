"""Read the buildable capacity of a project: any member of the study, in any phase.

Computed on every read from the saved technical data, so a change of any planning or surface
datum shows up at once. Read only: nothing is written, so nothing is audited.
"""

from __future__ import annotations

from dataclasses import dataclass

from backend.app.study.domain.context import RequestContext
from backend.app.technical_data.domain.capacity import CapacityResult, compute_capacity
from backend.app.technical_data.domain.errors import ProjectNotFound
from backend.app.technical_data.domain.ports import TechnicalDataRepository, TechnicalProjects


@dataclass(frozen=True)
class CapacityAnswer:
    result: CapacityResult | None = None
    error: Exception | None = None


class GetCapacity:
    def __init__(self, projects: TechnicalProjects, data: TechnicalDataRepository) -> None:
        self._projects = projects
        self._data = data

    def execute(self, context: RequestContext, code: str) -> CapacityAnswer:
        project = self._projects.find(code, lock=False)
        if project is None:
            return CapacityAnswer(error=ProjectNotFound())
        sheet = self._data.load(project.id)
        return CapacityAnswer(result=compute_capacity({d.field_id: d.value for d in sheet.data}))
