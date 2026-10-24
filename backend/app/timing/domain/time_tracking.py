"""Active clock per phase and calendar.

Pure functions. Time is computed in days over half-open spans ``[start, end)`` and reported in
weeks with one decimal. Pauses stop the active clock, not the calendar: a pause removes days from
the active total but they stay in the calendar total.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from enum import Enum

FIRST_PLANNED_PHASE = 1
LAST_PHASE = 7
PLANNED_PHASES = 7
DAYS_PER_WEEK = 7


class PauseReason(str, Enum):
    CLIENT_WAIT = "client_wait"
    AUTHORITY_WAIT = "authority_wait"
    INTERNAL_DECISION = "internal_decision"
    OTHER = "other"


class InvalidSpan(ValueError):
    """A phase or pause span is inconsistent (end before start, repeated or overlapping)."""


class OverlappingPauses(InvalidSpan):
    """Two pauses overlap in time: the same day would be counted as paused twice."""


@dataclass(frozen=True)
class PhaseSpan:
    phase: int
    start: date
    end: date | None = None  # None: the phase is still open


@dataclass(frozen=True)
class PauseSpan:
    start: date
    end: date | None  # None: the pause is still open
    reason: PauseReason


@dataclass(frozen=True)
class PauseSegment:
    """The part of a pause that falls inside one phase."""

    phase: int
    start: date
    end: date
    reason: PauseReason

    @property
    def days(self) -> int:
        return (self.end - self.start).days


@dataclass(frozen=True)
class PhaseTime:
    phase: int
    plan_weeks: int
    active_days: int
    pause_days: int

    @property
    def active_weeks(self) -> Decimal:
        return to_weeks(self.active_days)

    @property
    def pause_weeks(self) -> Decimal:
        return to_weeks(self.pause_days)


@dataclass(frozen=True)
class TimeSummary:
    phases: tuple[PhaseTime, ...]  # always phases 1 to 7, in order
    pauses: tuple[PauseSegment, ...]
    pause_days_by_reason: dict[PauseReason, int]
    current_phase: int | None
    deviation_days: int  # positive = delay

    @property
    def total_active_days(self) -> int:
        return sum(p.active_days for p in self.phases)

    @property
    def total_pause_days(self) -> int:
        return sum(p.pause_days for p in self.phases)

    @property
    def calendar_days(self) -> int:
        return self.total_active_days + self.total_pause_days

    @property
    def total_plan_weeks(self) -> int:
        return sum(p.plan_weeks for p in self.phases)

    @property
    def total_active_weeks(self) -> Decimal:
        return to_weeks(self.total_active_days)

    @property
    def total_pause_weeks(self) -> Decimal:
        return to_weeks(self.total_pause_days)

    @property
    def calendar_weeks(self) -> Decimal:
        return to_weeks(self.calendar_days)

    @property
    def deviation_weeks(self) -> Decimal:
        return to_weeks(self.deviation_days)


def to_weeks(days: int) -> Decimal:
    return (Decimal(days) / DAYS_PER_WEEK).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def phase_spans_from_entries(
    entries: Iterable[tuple[int, date]], *, closed_on: date | None = None
) -> list[PhaseSpan]:
    """Build phase spans from the date each phase was entered (the promotions).

    Each phase ends when the next one starts; the last one stays open unless ``closed_on`` is
    given (a closed project).
    """
    ordered = sorted(entries, key=lambda entry: entry[1])
    spans = []
    for index, (phase, start) in enumerate(ordered):
        is_last = index == len(ordered) - 1
        end = closed_on if is_last else ordered[index + 1][1]
        spans.append(PhaseSpan(phase=phase, start=start, end=end))
    return spans


def summarize_time(
    phase_spans: Sequence[PhaseSpan],
    pause_spans: Sequence[PauseSpan],
    *,
    plan_weeks: Sequence[int],
    as_of: date,
) -> TimeSummary:
    plan = _validate_plan(plan_weeks)
    phases = _resolve_phases(phase_spans, as_of)
    pauses = _resolve_pauses(pause_spans, as_of)

    segments = _split_pauses(pauses, phases)
    pause_days = {phase: 0 for phase in range(FIRST_PLANNED_PHASE, LAST_PHASE + 1)}
    by_reason: dict[PauseReason, int] = {}
    for segment in segments:
        pause_days[segment.phase] += segment.days
        by_reason[segment.reason] = by_reason.get(segment.reason, 0) + segment.days

    span_days = {span.phase: (end - span.start).days for span, end in phases}
    times = tuple(
        PhaseTime(
            phase=phase,
            plan_weeks=plan[phase - 1],
            active_days=span_days.get(phase, 0) - pause_days[phase],
            pause_days=pause_days[phase],
        )
        for phase in range(FIRST_PLANNED_PHASE, LAST_PHASE + 1)
    )

    current = next((s.phase for s, _ in phases if s.end is None and s.phase >= 1), None)
    return TimeSummary(
        phases=times,
        pauses=tuple(segments),
        pause_days_by_reason=by_reason,
        current_phase=current,
        deviation_days=_deviation_days(times, phases, current),
    )


def _validate_plan(plan_weeks: Sequence[int]) -> tuple[int, ...]:
    if len(plan_weeks) != PLANNED_PHASES or any(w < 1 for w in plan_weeks):
        raise ValueError("the plan needs 7 values of at least 1 week (phases 1 to 7)")
    return tuple(plan_weeks)


def _resolve_phases(spans: Sequence[PhaseSpan], as_of: date) -> list[tuple[PhaseSpan, date]]:
    """Pair each span with its effective end (open spans end at ``as_of``) and validate them."""
    resolved = []
    for span in spans:
        if not 0 <= span.phase <= LAST_PHASE:
            raise InvalidSpan(f"phase {span.phase} does not exist")
        if span.end is None and span.start > as_of:
            raise InvalidSpan(f"phase {span.phase} starts after the reference date")
        end = as_of if span.end is None else span.end
        if end < span.start:
            raise InvalidSpan(f"phase {span.phase} ends before it starts")
        resolved.append((span, end))

    if len({span.phase for span, _ in resolved}) != len(resolved):
        raise InvalidSpan("a phase appears more than once")
    if sum(1 for span, _ in resolved if span.end is None) > 1:
        raise InvalidSpan("only one phase can be open")
    ordered = sorted(resolved, key=lambda item: item[0].start)
    for (_, previous_end), (following, _) in zip(ordered, ordered[1:], strict=False):
        if following.start < previous_end:
            raise InvalidSpan(f"phase {following.phase} overlaps the previous one")
    return [(span, end) for span, end in ordered if span.phase >= FIRST_PLANNED_PHASE]


def _resolve_pauses(spans: Sequence[PauseSpan], as_of: date) -> list[tuple[PauseSpan, date]]:
    resolved = []
    for span in spans:
        if span.end is None and span.start > as_of:
            raise InvalidSpan("a pause starts after the reference date")
        end = as_of if span.end is None else span.end
        if end < span.start:
            raise InvalidSpan("a pause ends before it starts")
        resolved.append((span, end))
    ordered = sorted(resolved, key=lambda item: item[0].start)
    for (_, previous_end), (following, _) in zip(ordered, ordered[1:], strict=False):
        if following.start < previous_end:
            raise OverlappingPauses("two pauses overlap in time")
    return ordered


def _split_pauses(
    pauses: list[tuple[PauseSpan, date]], phases: list[tuple[PhaseSpan, date]]
) -> list[PauseSegment]:
    segments = []
    for pause, pause_end in pauses:
        for span, span_end in phases:
            start = max(pause.start, span.start)
            end = min(pause_end, span_end)
            if start < end:
                segments.append(PauseSegment(span.phase, start, end, pause.reason))
    return sorted(segments, key=lambda segment: (segment.start, segment.phase))


def _deviation_days(
    times: tuple[PhaseTime, ...],
    phases: list[tuple[PhaseSpan, date]],
    current: int | None,
) -> int:
    """Delay against the plan: closed phases count with sign, the current one only its excess.

    An unfinished phase never offsets a delay accumulated before it.
    """
    by_phase = {t.phase: t for t in times}
    deviation = 0
    for span, _ in phases:
        time = by_phase[span.phase]
        difference = time.active_days - time.plan_weeks * DAYS_PER_WEEK
        deviation += max(0, difference) if span.phase == current else difference
    return deviation
