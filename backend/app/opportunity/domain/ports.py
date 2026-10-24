"""Ports of the opportunity context."""

from __future__ import annotations

from decimal import Decimal
from typing import Protocol

from backend.app.opportunity.domain.opportunity import Opportunity
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


class OpportunityRepository(Protocol):
    def next_code(self, year: int) -> str:
        """Next `PRY-YYYY-NNN` of the study. Serializes concurrent callers until commit."""
        ...

    def add(self, code: str, opportunity: Opportunity) -> None:
        """Create the project (phase 0, inactive) and its opportunity."""
        ...
