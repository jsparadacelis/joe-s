"""Readiness of a project's exit deliverable: ready, in progress or blocked.

Rules to review with RGB (see docs/plans/RGB-12/plan.md). Pure: what is missing is computed by
the application layer with the rules each phase already has; this module only classifies it.
The reasons are user-facing Spanish text.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import Enum

from backend.app.access.domain.policy import who_promotes
from backend.app.lifecycle.domain.phases import LAST_PHASE, validate_phase

_LISTED_ITEMS = 3


class ReadinessState(str, Enum):
    READY = "ready"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"


@dataclass(frozen=True)
class Readiness:
    state: ReadinessState
    reason: str | None


def is_listed(phase: int) -> bool:
    """Closing (phase 7) has no next phase to promote to, so it never appears in the list."""
    return validate_phase(phase) < LAST_PHASE


def promoter_label(phase: int) -> str:
    """Who promotes out of the phase, e.g. "Socio o director"."""
    first, *rest = who_promotes(phase)
    return " o ".join([first, *(label[0].lower() + label[1:] for label in rest)])


def _date(day: date) -> str:
    return day.strftime("%d/%m/%Y")


def _missing_reason(missing: list[str]) -> str:
    shown = ", ".join(missing[:_LISTED_ITEMS])
    rest = len(missing) - _LISTED_ITEMS
    return f"Falta: {shown} y {rest} más." if rest > 0 else f"Falta: {shown}."


def _paused_reason(expected_resumption: date | None, today: date) -> str:
    if expected_resumption is None:
        return "En pausa."
    late = " (vencida)" if expected_resumption < today else ""
    return f"En pausa; reanudación prevista el {_date(expected_resumption)}{late}."


def assess(
    *,
    phase: int,
    paused: bool,
    expected_resumption: date | None,
    missing: list[str],
    today: date,
) -> Readiness:
    """A pause blocks; otherwise anything missing keeps it in progress; else it is ready."""
    if not is_listed(phase):
        raise ValueError(f"phase {phase} is not listed: it has no next phase")
    if paused:
        return Readiness(ReadinessState.BLOCKED, _paused_reason(expected_resumption, today))
    if missing:
        return Readiness(ReadinessState.IN_PROGRESS, _missing_reason(missing))
    return Readiness(ReadinessState.READY, None)
