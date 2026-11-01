"""A project seen by the "to promote" list: everything needed to judge its exit deliverable,
loaded in bulk so that judging a list of projects costs a fixed number of queries."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from backend.app.lifecycle.domain.deliverable import ExitDeliverable
from backend.app.opportunity.domain.project_plan import ConfirmedPlan
from backend.app.opportunity.domain.project_sheet import SheetProject
from backend.app.technical_data.domain.ports import QueryRecord
from backend.app.technical_data.domain.technical_data import TechnicalData


@dataclass(frozen=True)
class SheetInputs:
    """Phase 1: what the project sheet is built from."""

    project: SheetProject
    plan: ConfirmedPlan | None
    stored: dict[str, Any] | None


@dataclass(frozen=True)
class TechnicalInputs:
    """Phase 2: the technical data of the project and its last cadastral query."""

    data: TechnicalData
    last_query: QueryRecord | None


@dataclass(frozen=True)
class Candidate:
    id: str
    code: str
    name: str
    phase: int
    paused: bool
    in_phase_since: datetime
    expected_resumption: date | None = None
    # Exit deliverable of the current phase, if it has a row.
    deliverable: ExitDeliverable | None = None
    # Phase 0: the opportunity has a saved scoring.
    scored: bool = False
    sheet: SheetInputs | None = None
    technical: TechnicalInputs | None = None
