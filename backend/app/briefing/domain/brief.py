"""The manual brief of the Briefing phase (RGB-32): fields, validation, completeness and
permissions. Pure rules, no I/O. The team writes it; nothing here is produced by AI."""

from __future__ import annotations

import math
import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Any

from backend.app.briefing.domain.errors import (
    BRIEF_FIELD_LABELS,
    InvalidBriefField,
    InvalidBriefRequest,
    UnknownBriefField,
)
from backend.app.shared.text import is_storable

BRIEF_PHASE = 2  # the brief is the exit deliverable of phase 2 and is editable only there
FROZEN_BRIEF_VERSION = 1  # frozen once, when promoting from phase 2
BRIEF_KEY = "brief"  # key of the exit deliverable content that holds the brief
TECHNICAL_DATA_KEY = "technical_data"  # key of the frozen content that holds the data photo


class ClientApproval(str, Enum):
    PENDING = "pending"
    EMAIL = "email"
    MEETING = "meeting"
    SIGNED = "signed"


REQUIRED_FIELDS = ("needs", "program", "constraints", "target_budget", "deadline")
EDITABLE_FIELDS = (
    *REQUIRED_FIELDS,
    "topographic_survey",
    "alignment",
    "client_approval",
)
_TEXT_LIMIT = 2000
_BUDGET_MAX = 1_000_000_000
_BUDGET_DECIMALS = 2
_DEADLINE_YEARS = (2000, 2100)
_ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")


def _text(field: str, value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise InvalidBriefField(field, "debe ser un texto")
    text = value.strip()
    if not text:
        return None
    if not is_storable(text):
        raise InvalidBriefField(field, "contiene caracteres no permitidos")
    if len(text) > _TEXT_LIMIT:
        raise InvalidBriefField(field, f"admite como máximo {_TEXT_LIMIT} caracteres")
    return text


def _budget(value: Any) -> int | float | None:
    if value is None:
        return None
    reason = (
        "debe ser un número en euros, mayor que 0, de hasta 1.000.000.000 y con "
        f"como máximo {_BUDGET_DECIMALS} decimales"
    )
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise InvalidBriefField("target_budget", reason)
    if isinstance(value, float) and not math.isfinite(value):
        raise InvalidBriefField("target_budget", reason)
    if not 0 < value <= _BUDGET_MAX:
        raise InvalidBriefField("target_budget", reason)
    exact = Decimal(repr(value))
    if exact.as_tuple().exponent < -_BUDGET_DECIMALS:
        raise InvalidBriefField("target_budget", reason)
    return int(exact) if exact == exact.to_integral_value() else float(value)


def _deadline(value: Any) -> str | None:
    text = _text("deadline", value)
    if text is None:
        return None
    try:
        if not _ISO_DATE.fullmatch(text):
            raise ValueError(text)
        parsed = date.fromisoformat(text)
        if not _DEADLINE_YEARS[0] <= parsed.year <= _DEADLINE_YEARS[1]:
            raise ValueError(text)
    except ValueError:
        raise InvalidBriefField(
            "deadline", "debe ser una fecha con el formato AAAA-MM-DD"
        ) from None
    return text


def _approval(value: Any) -> str | None:
    text = _text("client_approval", value)
    if text is None:
        return None
    if text not in {a.value for a in ClientApproval}:
        raise InvalidBriefField(
            "client_approval", 'debe ser "pending", "email", "meeting" o "signed"'
        )
    return text


def validate_brief_update(fields: Any) -> dict[str, Any]:
    """Unknown keys first, then values. `None` as a value means "delete it"."""
    if not isinstance(fields, dict) or not fields:
        raise InvalidBriefRequest()
    for name in fields:
        if name not in EDITABLE_FIELDS:
            raise UnknownBriefField(name)
    checks = {"target_budget": _budget, "deadline": _deadline, "client_approval": _approval}
    return {
        name: checks[name](value) if name in checks else _text(name, value)
        for name, value in fields.items()
    }


@dataclass(frozen=True)
class Brief:
    """Every editable field, in display order; an empty one is `None` (the approval, a
    pending one)."""

    fields: dict[str, Any]


def build_brief(stored: Mapping[str, Any] | None) -> Brief:
    stored = stored or {}
    fields: dict[str, Any] = {}
    for name in EDITABLE_FIELDS:
        value = stored.get(name)
        if isinstance(value, str) and not value.strip():
            value = None
        fields[name] = value
    if fields["client_approval"] is None:
        fields["client_approval"] = ClientApproval.PENDING.value
    return Brief(fields)


@dataclass(frozen=True)
class Completeness:
    missing: list[str]
    technical_data_obtained: bool
    technical_data_queried: bool
    client_approval_recorded: bool

    @property
    def complete(self) -> bool:
        return not self.blockers()

    def blockers(self) -> list[str]:
        """Spanish labels of everything that stops the promotion, in display order."""
        blockers = list(self.missing)
        if not self.technical_data_obtained:
            blockers.append("Datos técnicos obtenidos")
        if not self.client_approval_recorded:
            blockers.append("Aprobación del cliente registrada")
        return blockers


def completeness(
    brief: Brief, *, technical_data_obtained: bool, technical_data_queried: bool
) -> Completeness:
    return Completeness(
        missing=[BRIEF_FIELD_LABELS[n] for n in REQUIRED_FIELDS if brief.fields[n] is None],
        technical_data_obtained=technical_data_obtained,
        technical_data_queried=technical_data_queried,
        client_approval_recorded=brief.fields["client_approval"] != ClientApproval.PENDING.value,
    )


@dataclass(frozen=True)
class BriefPermissions:
    """What the person may do with the brief; computed by the server, never by the client."""

    can_edit: bool
    can_promote: bool


def brief_permissions(
    *, phase: int, authorized: bool, completeness: Completeness
) -> BriefPermissions:
    """Edit: phase 2 and authority. Promote: that, plus nothing left to complete."""
    can_edit = phase == BRIEF_PHASE and authorized
    return BriefPermissions(can_edit, can_edit and completeness.complete)


@dataclass(frozen=True)
class ProjectBrief:
    """The brief as a person sees it. `technical_data` is the live photo of the starting data
    in phase 2 and the frozen one afterwards."""

    code: str
    phase: int
    frozen_version: int | None
    fields: dict[str, Any]
    completeness: Completeness
    technical_data: dict[str, Any]
    permissions: BriefPermissions
