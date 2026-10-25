"""Project sheet (RGB-17a): blocks, fields and completion. Pure rules, no I/O."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from backend.app.opportunity.domain.plan import ProjectType
from backend.app.opportunity.domain.project_plan import ConfirmedPlan

AUTO = "auto"
SCORING = "scoring"
MANUAL = "manual"

# (block, ((field, required, source), ...)) in display order.
_LAYOUT: tuple[tuple[str, tuple[tuple[str, bool, str], ...]], ...] = (
    (
        "identification",
        (
            ("code", True, AUTO),
            ("name", True, SCORING),
            ("client", True, SCORING),
            ("location", True, SCORING),
            ("cadastral_reference", True, MANUAL),
            ("project_type", True, SCORING),
            ("scale", True, SCORING),
        ),
    ),
    (
        "engagement",
        (
            ("scope_included", True, MANUAL),
            ("scope_excluded", True, MANUAL),
            ("contract_signed_on", True, MANUAL),
        ),
    ),
    (
        "governance",
        (
            ("sponsor", True, MANUAL),
            ("project_director", True, MANUAL),
            ("technical_lead", True, MANUAL),
            ("team", False, MANUAL),
            ("external_collaborators", False, MANUAL),
        ),
    ),
    ("client_contact", (("contact", True, MANUAL),)),
    (
        "timing",
        (
            ("confirmed_plan", True, SCORING),
            ("next_milestone", True, MANUAL),
            ("next_milestone_on", True, MANUAL),
        ),
    ),
    ("risk", (("main_risk", True, MANUAL), ("risk_owner", True, MANUAL))),
    ("information", (("repository_path", True, MANUAL),)),
    ("status", (("traffic_light", False, AUTO),)),
)


@dataclass(frozen=True)
class SheetProject:
    """The project data the sheet is prefilled from."""

    id: str
    code: str
    current_phase: int
    name: str
    client: str
    location: str
    project_type: ProjectType
    traffic_light: str | None


@dataclass(frozen=True)
class SheetField:
    field: str
    required: bool
    value: Any
    source: str


@dataclass(frozen=True)
class SheetBlock:
    block: str
    filled: int
    required: int
    complete: bool
    fields: tuple[SheetField, ...]


@dataclass(frozen=True)
class Completion:
    filled: int
    required: int
    percent: int


@dataclass(frozen=True)
class ProjectSheet:
    code: str
    phase: int
    completion: Completion
    blocks: tuple[SheetBlock, ...]


def _clean(value: Any) -> Any:
    """Blank strings count as empty."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    return value


def _prefilled(project: SheetProject, plan: ConfirmedPlan | None) -> dict[str, Any]:
    return {
        "code": project.code,
        "name": project.name,
        "client": project.client,
        "location": project.location,
        "project_type": project.project_type.value,
        "scale": None if plan is None else plan.scale.value,
        "confirmed_plan": None
        if plan is None
        else {
            "weeks_by_phase": {str(phase): weeks for phase, weeks in plan.weeks_by_phase.items()},
            "total": plan.total,
        },
        "traffic_light": project.traffic_light,
    }


def completion_percent(filled: int, required: int) -> int:
    """Rounded half up; with nothing required there is nothing pending, so 100."""
    if required == 0:
        return 100
    return (filled * 100 + required // 2) // required


def build_sheet(
    *,
    project: SheetProject,
    plan: ConfirmedPlan | None,
    manual: Mapping[str, Any] | None,
) -> ProjectSheet:
    """Prefilled values win over manual ones; only required fields count towards completion.

    The traffic light is optional and automatic: a freshly promoted project has none yet (time
    tracking computes it later), so requiring it would make the sheet impossible to complete.
    """
    stored = manual or {}
    prefilled = _prefilled(project, plan)
    blocks = []
    for block, layout in _LAYOUT:
        fields = tuple(
            SheetField(
                name,
                required,
                _clean(prefilled[name] if source != MANUAL else stored.get(name)),
                source,
            )
            for name, required, source in layout
        )
        required_fields = [f for f in fields if f.required]
        filled = sum(f.value is not None for f in required_fields)
        blocks.append(
            SheetBlock(block, filled, len(required_fields), filled == len(required_fields), fields)
        )
    filled = sum(b.filled for b in blocks)
    required = sum(b.required for b in blocks)
    percent = completion_percent(filled, required)
    return ProjectSheet(
        project.code, project.current_phase, Completion(filled, required, percent), tuple(blocks)
    )
