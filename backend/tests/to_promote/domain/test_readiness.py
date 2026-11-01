"""Readiness rules of the "to promote" list: pure, one case per phase and per situation."""

from datetime import date

import pytest

from backend.app.to_promote.domain.readiness import (
    ReadinessState,
    assess,
    is_listed,
    promoter_label,
)

TODAY = date(2026, 11, 1)


def assess_with(phase=2, paused=False, expected_resumption=None, missing=()):
    return assess(
        phase=phase,
        paused=paused,
        expected_resumption=expected_resumption,
        missing=list(missing),
        today=TODAY,
    )


@pytest.mark.parametrize("phase", [0, 1, 2, 3, 4, 5, 6])
def test_nothing_missing_and_not_paused_is_ready_in_every_listed_phase(phase):
    result = assess_with(phase=phase)

    assert result.state is ReadinessState.READY
    assert result.reason is None


@pytest.mark.parametrize("phase", [0, 1, 2, 3, 4, 5, 6])
def test_something_missing_is_in_progress_in_every_listed_phase(phase):
    result = assess_with(phase=phase, missing=["Necesidades"])

    assert result.state is ReadinessState.IN_PROGRESS
    assert result.reason == "Falta: Necesidades."


def test_the_reason_lists_up_to_three_items_and_counts_the_rest():
    result = assess_with(missing=["A", "B", "C", "D", "E"])

    assert result.reason == "Falta: A, B, C y 2 más."


def test_the_reason_lists_exactly_three_items_without_a_remainder():
    assert assess_with(missing=["A", "B", "C"]).reason == "Falta: A, B, C."


def test_a_paused_project_is_blocked_with_the_expected_resumption_date():
    result = assess_with(paused=True, expected_resumption=date(2026, 11, 20))

    assert result.state is ReadinessState.BLOCKED
    assert result.reason == "En pausa; reanudación prevista el 20/11/2026."


def test_an_overdue_pause_says_so():
    result = assess_with(paused=True, expected_resumption=date(2026, 10, 25))

    assert result.state is ReadinessState.BLOCKED
    assert result.reason == "En pausa; reanudación prevista el 25/10/2026 (vencida)."


def test_a_pause_blocks_even_when_the_deliverable_is_complete():
    result = assess_with(paused=True, expected_resumption=date(2026, 11, 20), missing=[])

    assert result.state is ReadinessState.BLOCKED


def test_a_pause_blocks_even_when_the_deliverable_is_incomplete():
    result = assess_with(paused=True, expected_resumption=date(2026, 11, 20), missing=["X"])

    assert result.state is ReadinessState.BLOCKED


def test_a_paused_project_without_an_open_pause_row_is_still_blocked():
    result = assess_with(paused=True, expected_resumption=None)

    assert result.state is ReadinessState.BLOCKED
    assert result.reason == "En pausa."


def test_phases_zero_to_six_are_listed_and_closing_is_not():
    assert [is_listed(phase) for phase in range(8)] == [True] * 7 + [False]


def test_assessing_the_closing_phase_is_an_error():
    with pytest.raises(ValueError):
        assess_with(phase=7)


@pytest.mark.parametrize(
    ("phase", "label"),
    [
        (0, "Socio o director"),
        (1, "Socio o director"),
        (2, "Director de proyecto"),
        (3, "Director de proyecto"),
        (4, "Firmante habilitado"),
        (5, "Firmante habilitado"),
        (6, "Dirección facultativa"),
    ],
)
def test_who_promotes_in_spanish_by_phase(phase, label):
    assert promoter_label(phase) == label
