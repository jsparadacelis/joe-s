from datetime import date
from decimal import Decimal

import pytest

from backend.app.timing.domain.time_tracking import (
    InvalidSpan,
    OverlappingPauses,
    PauseReason,
    PauseSpan,
    PhaseSpan,
    phase_spans_from_entries,
    summarize_time,
    to_weeks,
)

PLAN = (2, 3, 5, 6, 8, 36, 4)
D = date
AS_OF = D(2027, 1, 1)


def weeks(n):
    return n * 7


def summarize(spans, pauses=(), as_of=AS_OF, plan=PLAN):
    return summarize_time(spans, pauses, plan_weeks=plan, as_of=as_of)


class TestToWeeks:
    @pytest.mark.parametrize(
        ("days", "expected"),
        [
            (0, "0.0"),
            (7, "1.0"),
            (10, "1.4"),
            (3, "0.4"),
            (4, "0.6"),
            (6, "0.9"),
            (21, "3.0"),
            (-10, "-1.4"),
        ],
    )
    def test_converts_days_to_weeks_with_one_decimal_half_up(self, days, expected):
        assert to_weeks(days) == Decimal(expected)


class TestPrdExample:
    """3 active weeks + 4 of pause + 5 active = 8 active weeks in 12 calendar weeks."""

    def test_eight_active_weeks_in_twelve_calendar_weeks(self):
        start = D(2026, 1, 5)
        span = PhaseSpan(phase=2, start=start, end=D(2026, 3, 30))  # 12 weeks
        pause = PauseSpan(start=D(2026, 1, 26), end=D(2026, 2, 23), reason=PauseReason.CLIENT_WAIT)

        summary = summarize([span], [pause])

        assert summary.total_active_weeks == Decimal("8.0")
        assert summary.total_pause_weeks == Decimal("4.0")
        assert summary.calendar_weeks == Decimal("12.0")
        phase_2 = summary.phases[1]
        assert (phase_2.active_weeks, phase_2.pause_weeks) == (Decimal("8.0"), Decimal("4.0"))


class TestPhases:
    def test_always_returns_seven_phases_in_order_with_their_plan(self):
        summary = summarize([PhaseSpan(1, D(2026, 1, 5), D(2026, 1, 19))])

        assert [p.phase for p in summary.phases] == [1, 2, 3, 4, 5, 6, 7]
        assert [p.plan_weeks for p in summary.phases] == list(PLAN)

    def test_phases_never_reached_have_no_time(self):
        summary = summarize([PhaseSpan(1, D(2026, 1, 5), D(2026, 1, 19))])

        assert summary.phases[0].active_days == 14
        assert all(p.active_days == 0 and p.pause_days == 0 for p in summary.phases[1:])

    def test_consecutive_phases_do_not_count_the_boundary_day_twice(self):
        spans = [
            PhaseSpan(1, D(2026, 1, 5), D(2026, 1, 19)),
            PhaseSpan(2, D(2026, 1, 19), D(2026, 2, 2)),
        ]

        summary = summarize(spans)

        assert summary.calendar_days == 28

    def test_open_phase_runs_until_as_of(self):
        summary = summarize([PhaseSpan(3, D(2026, 1, 5), None)], as_of=D(2026, 1, 19))

        assert summary.phases[2].active_days == 14
        assert summary.current_phase == 3

    def test_without_an_open_phase_there_is_no_current_phase(self):
        summary = summarize([PhaseSpan(1, D(2026, 1, 5), D(2026, 1, 19))])

        assert summary.current_phase is None

    def test_phase_zero_has_no_clock(self):
        spans = [
            PhaseSpan(0, D(2025, 12, 1), D(2026, 1, 5)),
            PhaseSpan(1, D(2026, 1, 5), D(2026, 1, 12)),
        ]

        summary = summarize(spans)

        assert summary.calendar_days == 7


class TestPauses:
    def test_a_pause_reduces_active_days_not_calendar_days(self):
        span = PhaseSpan(2, D(2026, 1, 5), D(2026, 2, 2))
        pause = PauseSpan(D(2026, 1, 12), D(2026, 1, 19), PauseReason.OTHER)

        summary = summarize([span], [pause])

        assert (summary.phases[1].active_days, summary.phases[1].pause_days) == (21, 7)
        assert summary.calendar_days == 28

    def test_a_pause_crossing_a_phase_change_is_split_between_both_phases(self):
        spans = [
            PhaseSpan(2, D(2026, 1, 5), D(2026, 2, 2)),
            PhaseSpan(3, D(2026, 2, 2), D(2026, 3, 2)),
        ]
        pause = PauseSpan(D(2026, 1, 26), D(2026, 2, 9), PauseReason.AUTHORITY_WAIT)

        summary = summarize(spans, [pause])

        assert [(s.phase, s.days) for s in summary.pauses] == [(2, 7), (3, 7)]
        assert (summary.phases[1].active_days, summary.phases[1].pause_days) == (21, 7)
        assert (summary.phases[2].active_days, summary.phases[2].pause_days) == (21, 7)
        assert summary.total_pause_days == 14

    def test_segments_keep_their_dates_and_reason(self):
        spans = [PhaseSpan(2, D(2026, 1, 5), D(2026, 2, 2)), PhaseSpan(3, D(2026, 2, 2), None)]
        pause = PauseSpan(D(2026, 1, 26), D(2026, 2, 9), PauseReason.AUTHORITY_WAIT)

        summary = summarize(spans, [pause], as_of=D(2026, 3, 1))

        first, second = summary.pauses
        assert (first.start, first.end, first.reason) == (
            D(2026, 1, 26),
            D(2026, 2, 2),
            PauseReason.AUTHORITY_WAIT,
        )
        assert (second.start, second.end) == (D(2026, 2, 2), D(2026, 2, 9))

    def test_pause_days_are_grouped_by_reason(self):
        span = PhaseSpan(2, D(2026, 1, 5), D(2026, 3, 2))
        pauses = [
            PauseSpan(D(2026, 1, 12), D(2026, 1, 19), PauseReason.CLIENT_WAIT),
            PauseSpan(D(2026, 2, 2), D(2026, 2, 16), PauseReason.AUTHORITY_WAIT),
            PauseSpan(D(2026, 2, 16), D(2026, 2, 23), PauseReason.CLIENT_WAIT),
        ]

        summary = summarize([span], pauses)

        assert summary.pause_days_by_reason == {
            PauseReason.CLIENT_WAIT: 14,
            PauseReason.AUTHORITY_WAIT: 14,
        }

    def test_an_open_pause_runs_until_as_of(self):
        span = PhaseSpan(2, D(2026, 1, 5), None)
        pause = PauseSpan(D(2026, 1, 12), None, PauseReason.INTERNAL_DECISION)

        summary = summarize([span], [pause], as_of=D(2026, 1, 26))

        assert (summary.phases[1].active_days, summary.phases[1].pause_days) == (7, 14)

    def test_time_outside_any_phase_from_1_to_7_is_ignored(self):
        span = PhaseSpan(2, D(2026, 1, 5), D(2026, 1, 19))
        pause = PauseSpan(D(2025, 12, 1), D(2026, 1, 12), PauseReason.OTHER)

        summary = summarize([span], [pause])

        assert summary.total_pause_days == 7

    def test_overlapping_pauses_are_rejected(self):
        span = PhaseSpan(2, D(2026, 1, 5), D(2026, 3, 2))
        pauses = [
            PauseSpan(D(2026, 1, 12), D(2026, 1, 26), PauseReason.OTHER),
            PauseSpan(D(2026, 1, 19), D(2026, 2, 2), PauseReason.OTHER),
        ]

        with pytest.raises(OverlappingPauses):
            summarize([span], pauses)

    def test_back_to_back_pauses_are_allowed(self):
        span = PhaseSpan(2, D(2026, 1, 5), D(2026, 3, 2))
        pauses = [
            PauseSpan(D(2026, 1, 12), D(2026, 1, 19), PauseReason.OTHER),
            PauseSpan(D(2026, 1, 19), D(2026, 1, 26), PauseReason.CLIENT_WAIT),
        ]

        assert summarize([span], pauses).total_pause_days == 14


class TestDeviation:
    def test_is_zero_when_closed_phases_match_the_plan(self):
        spans = [PhaseSpan(1, D(2026, 1, 5), D(2026, 1, 19)), PhaseSpan(2, D(2026, 1, 19), None)]

        summary = summarize(spans, as_of=D(2026, 1, 26))

        assert summary.deviation_weeks == Decimal("0.0")

    def test_a_closed_phase_over_its_plan_is_a_delay(self):
        spans = [PhaseSpan(1, D(2026, 1, 5), D(2026, 2, 2)), PhaseSpan(2, D(2026, 2, 2), None)]

        summary = summarize(spans, as_of=D(2026, 2, 9))

        assert summary.deviation_weeks == Decimal("2.0")

    def test_a_closed_phase_under_its_plan_is_ahead_of_schedule(self):
        spans = [PhaseSpan(1, D(2026, 1, 5), D(2026, 1, 12)), PhaseSpan(2, D(2026, 1, 12), None)]

        summary = summarize(spans, as_of=D(2026, 1, 12))

        assert summary.deviation_weeks == Decimal("-1.0")

    def test_an_unfinished_phase_under_its_plan_gives_no_credit(self):
        spans = [PhaseSpan(1, D(2026, 1, 5), D(2026, 1, 19)), PhaseSpan(2, D(2026, 1, 19), None)]

        summary = summarize(spans, as_of=D(2026, 1, 26))

        assert summary.deviation_weeks == Decimal("0.0")

    def test_the_current_phase_over_its_plan_adds_its_excess(self):
        spans = [PhaseSpan(1, D(2026, 1, 5), D(2026, 1, 19)), PhaseSpan(2, D(2026, 1, 19), None)]

        summary = summarize(spans, as_of=D(2026, 3, 2))

        assert summary.deviation_weeks == Decimal("3.0")

    def test_pauses_do_not_count_as_delay(self):
        span = PhaseSpan(1, D(2026, 1, 5), D(2026, 3, 2))
        pause = PauseSpan(D(2026, 1, 19), D(2026, 3, 2), PauseReason.AUTHORITY_WAIT)

        summary = summarize([span], [pause])

        assert summary.phases[0].active_weeks == Decimal("2.0")
        assert summary.deviation_weeks == Decimal("0.0")


class TestTotals:
    def test_totals_add_up_and_include_the_plan(self):
        spans = [
            PhaseSpan(1, D(2026, 1, 5), D(2026, 1, 26)),
            PhaseSpan(2, D(2026, 1, 26), D(2026, 2, 23)),
        ]
        pause = PauseSpan(D(2026, 2, 2), D(2026, 2, 16), PauseReason.CLIENT_WAIT)

        summary = summarize(spans, [pause])

        assert summary.total_active_weeks == Decimal("5.0")
        assert summary.total_pause_weeks == Decimal("2.0")
        assert summary.calendar_weeks == Decimal("7.0")
        assert summary.total_plan_weeks == sum(PLAN)
        assert summary.total_active_days + summary.total_pause_days == summary.calendar_days


class TestValidation:
    def test_end_before_start_is_rejected(self):
        with pytest.raises(InvalidSpan):
            summarize([PhaseSpan(1, D(2026, 2, 1), D(2026, 1, 1))])

    def test_a_pause_with_end_before_start_is_rejected(self):
        span = PhaseSpan(2, D(2026, 1, 5), D(2026, 3, 2))

        with pytest.raises(InvalidSpan):
            summarize([span], [PauseSpan(D(2026, 2, 2), D(2026, 1, 12), PauseReason.OTHER)])

    def test_unknown_phase_is_rejected(self):
        with pytest.raises(InvalidSpan):
            summarize([PhaseSpan(8, D(2026, 1, 5), None)])

    def test_repeated_phase_is_rejected(self):
        spans = [
            PhaseSpan(2, D(2026, 1, 5), D(2026, 1, 12)),
            PhaseSpan(2, D(2026, 1, 12), D(2026, 1, 19)),
        ]

        with pytest.raises(InvalidSpan):
            summarize(spans)

    def test_overlapping_phases_are_rejected(self):
        spans = [
            PhaseSpan(1, D(2026, 1, 5), D(2026, 1, 19)),
            PhaseSpan(2, D(2026, 1, 12), D(2026, 1, 26)),
        ]

        with pytest.raises(InvalidSpan):
            summarize(spans)

    def test_two_open_phases_are_rejected(self):
        spans = [PhaseSpan(1, D(2026, 1, 5), None), PhaseSpan(2, D(2026, 1, 12), None)]

        with pytest.raises(InvalidSpan):
            summarize(spans)

    def test_a_span_starting_after_as_of_is_rejected(self):
        with pytest.raises(InvalidSpan):
            summarize([PhaseSpan(1, D(2026, 6, 1), None)], as_of=D(2026, 1, 1))

    @pytest.mark.parametrize("plan", [(1, 2, 3), (1, 2, 3, 4, 5, 6, 0)])
    def test_the_plan_needs_seven_positive_weeks(self, plan):
        with pytest.raises(ValueError):
            summarize([], plan=plan)


class TestPhaseSpansFromEntries:
    def test_each_phase_ends_when_the_next_one_starts(self):
        entries = [(1, D(2026, 1, 5)), (2, D(2026, 2, 2)), (3, D(2026, 3, 2))]

        spans = phase_spans_from_entries(entries)

        assert spans == [
            PhaseSpan(1, D(2026, 1, 5), D(2026, 2, 2)),
            PhaseSpan(2, D(2026, 2, 2), D(2026, 3, 2)),
            PhaseSpan(3, D(2026, 3, 2), None),
        ]

    def test_entries_are_sorted_by_date(self):
        entries = [(2, D(2026, 2, 2)), (1, D(2026, 1, 5))]

        spans = phase_spans_from_entries(entries)

        assert [s.phase for s in spans] == [1, 2]

    def test_a_project_closed_after_the_last_phase_can_end_it(self):
        spans = phase_spans_from_entries([(7, D(2026, 5, 4))], closed_on=D(2026, 6, 1))

        assert spans == [PhaseSpan(7, D(2026, 5, 4), D(2026, 6, 1))]

    def test_no_entries_means_no_spans(self):
        assert phase_spans_from_entries([]) == []
