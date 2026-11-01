"""Read the cross-data alerts of a project: any member of the study, in any phase.

Computed on every read from the current values and the project sheet, so an alert disappears
once its cause is fixed. Read only: nothing is written, so nothing is audited, and an alert never
changes a datum or a state.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from backend.app.study.domain.context import RequestContext
from backend.app.technical_data.domain.alerts import Alert, AlertConfig, evaluate_alerts
from backend.app.technical_data.domain.errors import ProjectNotFound
from backend.app.technical_data.domain.ports import (
    ProjectFactsReader,
    TechnicalDataRepository,
    TechnicalProjects,
)


@dataclass(frozen=True)
class AlertsAnswer:
    alerts: list[Alert] = field(default_factory=list)
    error: Exception | None = None


class GetAlerts:
    def __init__(
        self,
        projects: TechnicalProjects,
        data: TechnicalDataRepository,
        facts: ProjectFactsReader,
        config: AlertConfig | None = None,
    ) -> None:
        self._projects = projects
        self._data = data
        self._facts = facts
        self._config = config or AlertConfig()

    def execute(self, context: RequestContext, code: str) -> AlertsAnswer:
        project = self._projects.find(code, lock=False)
        if project is None:
            return AlertsAnswer(error=ProjectNotFound())
        sheet = self._data.load(project.id)
        values = {d.field_id: d.value for d in sheet.data}
        facts = self._facts.facts_of(project.id)
        return AlertsAnswer(alerts=evaluate_alerts(values, facts, self._config))
