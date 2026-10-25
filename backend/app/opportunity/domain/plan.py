"""Time plan: active weeks per phase = type template x scale factor (PRD starting figures)."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from enum import Enum
from typing import Any

from backend.app.opportunity.domain.errors import InvalidFactor, InvalidScale, InvalidWeeks

PLANNED_PHASES = 7  # phases 1 to 7 (phase 0 has no plan yet)
MAX_WEEKS = 520
MIN_FACTOR = Decimal("0.1")
MAX_FACTOR = Decimal("10")


class ProjectType(str, Enum):
    SINGLE_FAMILY_HOUSE = "single_family_house"
    REHABILITATION = "rehabilitation"
    MULTI_FAMILY = "multi_family"
    FACILITY = "facility"
    INDUSTRIAL = "industrial"
    RENOVATION_INTERIORS = "renovation_interiors"


class Scale(str, Enum):
    SMALL = "small"
    MEDIUM = "medium"
    LARGE = "large"


DEFAULT_TEMPLATES: dict[ProjectType, tuple[int, ...]] = {
    ProjectType.SINGLE_FAMILY_HOUSE: (2, 3, 5, 6, 8, 36, 4),
    ProjectType.REHABILITATION: (2, 3, 4, 6, 8, 30, 4),
    ProjectType.MULTI_FAMILY: (3, 4, 6, 8, 12, 72, 6),
    ProjectType.FACILITY: (3, 4, 6, 8, 12, 52, 6),
    ProjectType.INDUSTRIAL: (2, 2, 4, 5, 8, 40, 4),
    ProjectType.RENOVATION_INTERIORS: (1, 2, 3, 3, 5, 16, 2),
}

DEFAULT_SCALE_FACTORS: dict[Scale, Decimal] = {
    Scale.SMALL: Decimal("0.8"),
    Scale.MEDIUM: Decimal("1"),
    Scale.LARGE: Decimal("1.3"),
}


@dataclass(frozen=True)
class Plan:
    weeks: tuple[int, ...]

    @property
    def weeks_by_phase(self) -> dict[int, int]:
        return {phase: weeks for phase, weeks in enumerate(self.weeks, start=1)}

    @property
    def total(self) -> int:
        return sum(self.weeks)


def make_plan(
    project_type: ProjectType,
    scale: Scale,
    *,
    templates: Mapping[ProjectType, Sequence[int]] | None = None,
    factors: Mapping[Scale, Decimal] | None = None,
) -> Plan:
    template = (templates or {}).get(project_type, DEFAULT_TEMPLATES[project_type])
    factor = (factors or {}).get(scale, DEFAULT_SCALE_FACTORS[scale])
    return Plan(weeks=tuple(_scaled(Decimal(weeks) * factor) for weeks in template))


def _scaled(weeks: Decimal) -> int:
    # Half-up on purpose: Python's round() is banker's rounding (6.5 -> 6), the plan needs 7.
    return max(1, int(weeks.quantize(Decimal(1), rounding=ROUND_HALF_UP)))


def validate_weeks(weeks: Sequence[Any]) -> tuple[int, ...]:
    valid = (
        isinstance(weeks, (list, tuple))
        and len(weeks) == PLANNED_PHASES
        and all(type(w) is int and 1 <= w <= MAX_WEEKS for w in weeks)
    )
    if not valid:
        raise InvalidWeeks()
    return tuple(weeks)


def validate_scale(value: Any) -> Scale:
    if not isinstance(value, str) or value not in {s.value for s in Scale}:
        raise InvalidScale()
    return Scale(value)


def validate_factor(value: Any) -> Decimal:
    try:
        factor = Decimal(str(value))
    except InvalidOperation:
        raise InvalidFactor() from None
    if not factor.is_finite() or not MIN_FACTOR <= factor <= MAX_FACTOR:
        raise InvalidFactor()
    return factor
