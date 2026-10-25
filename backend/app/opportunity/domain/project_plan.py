"""Project plan confirmed when an opportunity is promoted to phase 1 (RGB-16)."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from backend.app.opportunity.domain.plan import ProjectType, Scale, validate_scale, validate_weeks


def _weeks_by_phase(weeks: tuple[int, ...]) -> dict[int, int]:
    return {phase: value for phase, value in enumerate(weeks, start=1)}


@dataclass(frozen=True)
class ProposedPlan:
    project_type: ProjectType
    scale: Scale
    weeks: tuple[int, ...]

    @classmethod
    def from_input(
        cls, project_type: ProjectType, scale: Any, weeks: Sequence[Any] | Any
    ) -> ProposedPlan:
        """The scale is validated before the weeks."""
        valid_scale = validate_scale(scale)
        return cls(project_type, valid_scale, validate_weeks(weeks))

    @property
    def weeks_by_phase(self) -> dict[int, int]:
        return _weeks_by_phase(self.weeks)

    @property
    def total(self) -> int:
        return sum(self.weeks)


@dataclass(frozen=True)
class StartableProject:
    """An opportunity as seen by the start use case."""

    id: str
    study_id: str
    code: str
    current_phase: int
    project_type: ProjectType
    client: str
    location: str


@dataclass(frozen=True)
class NewProjectPlan:
    study_id: str
    project_id: str
    project_type: ProjectType
    scale: Scale
    weeks: tuple[int, ...]
    confirmed_by: str


@dataclass(frozen=True)
class ConfirmedPlan:
    project_code: str
    project_type: ProjectType
    scale: Scale
    weeks: tuple[int, ...]
    confirmed_by: str
    confirmed_at: datetime

    @property
    def weeks_by_phase(self) -> dict[int, int]:
        return _weeks_by_phase(self.weeks)

    @property
    def total(self) -> int:
        return sum(self.weeks)
