"""Ports of the opportunity context."""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Protocol

from backend.app.opportunity.domain.opportunity import Opportunity
from backend.app.opportunity.domain.plan import ProjectType, Scale
from backend.app.opportunity.domain.project_plan import (
    ConfirmedPlan,
    NewProjectPlan,
    StartableProject,
)
from backend.app.opportunity.domain.project_sheet import SheetProject
from backend.app.opportunity.domain.scoring import (
    NewScoring,
    ScorableProject,
    Scoring,
    ScoringSettings,
)


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


class ScoringSettingsRepository(Protocol):
    def get(self) -> ScoringSettings | None:
        """The study's saved settings, or None when it has never changed them."""
        ...

    def save(self, settings: ScoringSettings) -> None:
        """Replace the study's settings. Saved scorings are never touched."""
        ...


class ScoringRepository(Protocol):
    def get_project(self, code: str, *, lock: bool = True) -> ScorableProject | None:
        """The project of the study; `lock` serializes concurrent scorings of the same one."""
        ...

    def add(self, new: NewScoring) -> Scoring:
        """Insert the next version of the project's scoring (insert-only)."""
        ...

    def latest(self, project_id: str) -> Scoring | None: ...

    def history(self, project_id: str) -> list[Scoring]:
        """Every version, newest first."""
        ...


class ProjectPlans(Protocol):
    def get_project(self, code: str, *, lock: bool = True) -> StartableProject | None:
        """The opportunity of the study; `lock` serializes concurrent starts of the same one."""
        ...

    def get(self, project_id: str) -> ConfirmedPlan | None: ...

    def add(self, new: NewProjectPlan) -> ConfirmedPlan:
        """Insert the baseline plan (insert-only; one per project)."""
        ...

    def save_exit_content(self, project_id: str, content: dict[str, Any]) -> None:
        """Set the content of the phase 0 exit deliverable and leave it complete and approved."""
        ...


class ProjectSheets(Protocol):
    def get_project(self, code: str) -> SheetProject | None:
        """The project of the study with the data its sheet is prefilled from."""
        ...

    def get_content(self, project_id: str) -> dict[str, Any] | None:
        """Content of the phase 1 exit deliverable, or None when there is no row yet."""
        ...

    def save_content(self, project_id: str, content: dict[str, Any]) -> None:
        """Merge `content` over the phase 1 exit deliverable (created if missing).

        Keys not in `content` are kept; a key whose value is None is removed. The deliverable's
        `complete` and `approved` flags are never changed.
        """
        ...
