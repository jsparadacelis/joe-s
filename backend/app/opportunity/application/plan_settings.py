"""Read and edit the plan settings of a study, and build plans from them."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from backend.app.audit.application.record import audit
from backend.app.audit.domain.ports import AuditLog
from backend.app.opportunity.domain.plan import (
    DEFAULT_SCALE_FACTORS,
    DEFAULT_TEMPLATES,
    Plan,
    ProjectType,
    Scale,
    make_plan,
    validate_factor,
    validate_weeks,
)
from backend.app.opportunity.domain.ports import PlanSettingsRepository
from backend.app.study.domain.context import RequestContext


@dataclass(frozen=True)
class PlanSettings:
    templates: dict[ProjectType, tuple[int, ...]]
    scale_factors: dict[Scale, Decimal]


class PlanSettingsService:
    def __init__(self, repo: PlanSettingsRepository, audit_log: AuditLog) -> None:
        self._repo = repo
        self._audit_log = audit_log

    def get_settings(self) -> PlanSettings:
        return PlanSettings(
            templates={**DEFAULT_TEMPLATES, **self._repo.get_templates()},
            scale_factors={**DEFAULT_SCALE_FACTORS, **self._repo.get_scale_factors()},
        )

    def make_plan(self, project_type: ProjectType, scale: Scale) -> Plan:
        settings = self.get_settings()
        return make_plan(
            project_type,
            scale,
            templates=settings.templates,
            factors=settings.scale_factors,
        )

    def update_template(
        self, context: RequestContext, project_type: ProjectType, weeks: Any
    ) -> None:
        valid = validate_weeks(weeks)
        old = self.get_settings().templates[project_type]
        self._repo.save_template(project_type, valid)
        audit(
            self._audit_log,
            context,
            entity="plan_settings",
            entity_id=f"template:{project_type.value}",
            action="update",
            old_value={"weeks": list(old)},
            new_value={"weeks": list(valid)},
        )

    def update_scale_factor(self, context: RequestContext, scale: Scale, factor: Any) -> None:
        valid = validate_factor(factor)
        old = self.get_settings().scale_factors[scale]
        self._repo.save_scale_factor(scale, valid)
        audit(
            self._audit_log,
            context,
            entity="plan_settings",
            entity_id=f"scale_factor:{scale.value}",
            action="update",
            old_value={"factor": str(old)},
            new_value={"factor": str(valid)},
        )
