"""A pause of a project's active clock: entity, authority and input validation.

Pure domain: "today" is always injected, never read from the system clock.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from typing import Any

from backend.app.study.domain.context import RequestContext, Role
from backend.app.timing.domain.errors import InvalidField, RequiredField
from backend.app.timing.domain.time_tracking import FIRST_PLANNED_PHASE, PauseReason

_ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
_AUTHORISED_ROLES = frozenset({Role.PROJECT_DIRECTOR, Role.DIRECTOR, Role.PARTNER})


def can_manage_pauses(context: RequestContext) -> bool:
    """Project director and management (director, partner) pause and resume."""
    return context.role in _AUTHORISED_ROLES


def days_past(expected_resumption: date, today: date) -> int:
    """Whole days `today` is past the expected date of an open pause (0 if not yet due)."""
    return max((today - expected_resumption).days, 0)


@dataclass(frozen=True)
class PausableProject:
    """What a pause needs to know about its project."""

    id: str
    study_id: str
    code: str
    current_phase: int
    paused: bool

    @property
    def has_clock(self) -> bool:
        return self.current_phase >= FIRST_PLANNED_PHASE


@dataclass(frozen=True)
class NewPause:
    study_id: str
    project_id: str
    phase: int
    reason: PauseReason
    started_on: date
    expected_resumption: date
    opened_by: str


@dataclass(frozen=True)
class Pause:
    id: str
    project_id: str
    phase: int
    reason: PauseReason
    started_on: date
    expected_resumption: date
    opened_by: str
    resumed_on: date | None = None
    closed_by: str | None = None

    @property
    def is_open(self) -> bool:
        return self.resumed_on is None

    def overdue(self, today: date) -> bool:
        return self.days_overdue(today) > 0

    def days_overdue(self, today: date) -> int:
        """Whole days past the expected date; 0 if closed or not yet due."""
        return 0 if not self.is_open else days_past(self.expected_resumption, today)


@dataclass(frozen=True)
class PauseRequest:
    reason: PauseReason
    expected_resumption: date

    @classmethod
    def from_input(cls, data: Mapping[str, Any], today: date) -> PauseRequest:
        """Validates in contract order (`reason`, then `expected_resumption`): first error wins."""
        reason = _reason(data.get("reason"))
        return cls(reason, _expected_resumption(data.get("expected_resumption"), today))


def _reason(value: Any) -> PauseReason:
    if value is None or (isinstance(value, str) and not value.strip()):
        raise RequiredField("reason")
    try:
        if isinstance(value, str):
            return PauseReason(value.strip())
    except ValueError:
        pass
    raise InvalidField("reason", "no es un motivo admitido")


def _expected_resumption(value: Any, today: date) -> date:
    if value is None or (isinstance(value, str) and not value.strip()):
        raise RequiredField("expected_resumption")
    if not isinstance(value, str) or not _ISO_DATE.fullmatch(value.strip()):
        raise InvalidField("expected_resumption", "debe ser una fecha con formato aaaa-mm-dd")
    try:
        parsed = date.fromisoformat(value.strip())
    except ValueError:
        raise InvalidField("expected_resumption", "no es una fecha existente") from None
    if parsed < today:
        raise InvalidField("expected_resumption", "no puede ser anterior a hoy")
    return parsed
