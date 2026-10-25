"""Project sheet (RGB-17a): blocks, fields and completion. Pure rules, no I/O."""

from __future__ import annotations

import json
import re
from collections.abc import Mapping
from dataclasses import asdict, dataclass
from datetime import date
from typing import Any

from backend.app.opportunity.domain.errors import (
    SHEET_FIELD_LABELS,
    InvalidSheetField,
    InvalidSheetRequest,
    UnknownSheetField,
)
from backend.app.opportunity.domain.plan import ProjectType, validate_project_type
from backend.app.opportunity.domain.project_plan import ConfirmedPlan, ProposedPlan
from backend.app.opportunity.domain.text import is_storable

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

EDITABLE_FIELDS = tuple(
    name for _, layout in _LAYOUT for name, _, source in layout if source == MANUAL
)
_DATE_FIELDS = frozenset({"contract_signed_on", "next_milestone_on"})
_LONG_FIELDS = frozenset({"scope_included", "scope_excluded", "main_risk"})
_LONG_LIMIT = 2000
_SHORT_LIMIT = 200
_ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
PLAN_KEY = "plan"  # key of the content that holds the recalculated plan


@dataclass(frozen=True)
class SheetUpdate:
    """A validated edit: `None` as a field value means "delete it"."""

    fields: dict[str, str | None]
    plan: ProposedPlan | None


def _validate_value(field: str, value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise InvalidSheetField(field, "debe ser un texto")
    text = value.strip()
    if not text:
        return None
    if not is_storable(text):
        raise InvalidSheetField(field, "contiene caracteres no permitidos")
    limit = _LONG_LIMIT if field in _LONG_FIELDS else _SHORT_LIMIT
    if len(text) > limit:
        raise InvalidSheetField(field, f"admite como máximo {limit} caracteres")
    if field in _DATE_FIELDS:
        try:
            if not _ISO_DATE.fullmatch(text):
                raise ValueError(text)
            date.fromisoformat(text)
        except ValueError:
            raise InvalidSheetField(field, "debe ser una fecha con el formato AAAA-MM-DD") from None
    return text


def validate_sheet_update(fields: Any, plan: Any) -> SheetUpdate:
    """Fields first (unknown keys, then values), then the plan (type, scale, weeks)."""
    if fields is not None and not isinstance(fields, dict):
        raise InvalidSheetRequest()
    if plan is not None and not isinstance(plan, dict):
        raise InvalidSheetRequest()
    if not fields and not plan:
        raise InvalidSheetRequest()
    valid = {}
    for name in fields or {}:
        if name not in EDITABLE_FIELDS:
            raise UnknownSheetField(name)
    for name, value in (fields or {}).items():
        valid[name] = _validate_value(name, value)
    proposed = None
    if plan:
        proposed = ProposedPlan.from_input(
            validate_project_type(plan.get("project_type")), plan.get("scale"), plan.get("weeks")
        )
    return SheetUpdate(valid, proposed)


def plan_content(plan: ProposedPlan) -> dict[str, Any]:
    """How a plan is stored in the sheet content."""
    return {
        "project_type": plan.project_type.value,
        "scale": plan.scale.value,
        "weeks": list(plan.weeks),
        "total": plan.total,
    }


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
class SheetPermissions:
    """What the person may do with the sheet; computed by the server, never by the client."""

    can_edit: bool
    can_promote: bool


@dataclass(frozen=True)
class ProjectSheet:
    code: str
    phase: int
    completion: Completion
    blocks: tuple[SheetBlock, ...]
    frozen_version: int | None = None
    permissions: SheetPermissions = SheetPermissions(can_edit=False, can_promote=False)


def _clean(value: Any) -> Any:
    """Blank strings count as empty."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    return value


def _prefilled(
    project: SheetProject, plan: ConfirmedPlan | None, saved: Mapping[str, Any] | None
) -> dict[str, Any]:
    """The saved (recalculated) plan wins over the baseline one."""
    project_type = project.project_type.value
    scale = None if plan is None else plan.scale.value
    confirmed = (
        None
        if plan is None
        else {
            "weeks_by_phase": {str(phase): weeks for phase, weeks in plan.weeks_by_phase.items()},
            "total": plan.total,
        }
    )
    if saved:
        project_type, scale = saved["project_type"], saved["scale"]
        confirmed = {
            "weeks_by_phase": {str(i): w for i, w in enumerate(saved["weeks"], start=1)},
            "total": saved["total"],
        }
    return {
        "code": project.code,
        "name": project.name,
        "client": project.client,
        "location": project.location,
        "project_type": project_type,
        "scale": scale,
        "confirmed_plan": confirmed,
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
    prefilled = _prefilled(project, plan, stored.get(PLAN_KEY))
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


SHEET_PHASE = 1  # the sheet is the exit deliverable of phase 1 and is editable only there
FROZEN_SHEET_VERSION = 1  # the sheet is frozen once, when promoting from phase 1
SHEET_KEY = "sheet"  # key of the frozen content that holds the resolved sheet

_PREFILLED_LABELS = {
    "code": "Código",
    "name": "Nombre",
    "client": "Cliente",
    "location": "Localización",
    "project_type": "Tipología",
    "scale": "Escala",
    "confirmed_plan": "Plan confirmado",
}


def missing_required_labels(sheet: ProjectSheet) -> list[str]:
    """Spanish labels of the required fields without a value, in display order."""
    labels = {**_PREFILLED_LABELS, **SHEET_FIELD_LABELS}
    return [
        labels.get(f.field, f.field)
        for block in sheet.blocks
        for f in block.fields
        if f.required and f.value is None
    ]


def sheet_permissions(*, phase: int, authorized: bool, completion: Completion) -> SheetPermissions:
    """Edit: phase 1 and authority. Promote: that, plus every required field filled."""
    can_edit = phase == SHEET_PHASE and authorized
    return SheetPermissions(can_edit, can_edit and completion.percent == 100)


def sheet_content(sheet: ProjectSheet) -> dict[str, Any]:
    """The JSON stored under `sheet` when freezing: the sheet as seen, without the
    per-request permissions or the version."""
    content = {
        "code": sheet.code,
        "phase": sheet.phase,
        "completion": asdict(sheet.completion),
        "blocks": [asdict(block) for block in sheet.blocks],
    }
    return json.loads(json.dumps(content))  # tuples become lists, as when read back


def sheet_from_content(content: Mapping[str, Any]) -> ProjectSheet:
    """Inverse of `sheet_content`."""
    blocks = tuple(
        SheetBlock(
            b["block"],
            b["filled"],
            b["required"],
            b["complete"],
            tuple(
                SheetField(f["field"], f["required"], f["value"], f["source"]) for f in b["fields"]
            ),
        )
        for b in content["blocks"]
    )
    return ProjectSheet(
        content["code"], content["phase"], Completion(**content["completion"]), blocks
    )
