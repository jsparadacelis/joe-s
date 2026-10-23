"""Ports of the opportunity context."""

from __future__ import annotations

from decimal import Decimal
from typing import Protocol

from backend.app.opportunity.domain.plan import ProjectType, Scale


class PlanSettingsRepository(Protocol):
    def get_templates(self) -> dict[ProjectType, tuple[int, ...]]:
        """Only the templates the study has changed."""
        ...

    def get_scale_factors(self) -> dict[Scale, Decimal]:
        """Only the factors the study has changed."""
        ...

    def save_template(self, project_type: ProjectType, weeks: tuple[int, ...]) -> None: ...

    def save_scale_factor(self, scale: Scale, factor: Decimal) -> None: ...
