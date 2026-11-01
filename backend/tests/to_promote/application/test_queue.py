"""The list use case with simulated ports: ordering, counter, labels and can_promote."""

from datetime import datetime, timedelta, timezone
from unittest.mock import create_autospec

from backend.app.access.domain.project_roles import ProjectRole
from backend.app.study.domain.context import RequestContext, Role
from backend.app.to_promote.application.queue import ToPromoteQueue
from backend.app.to_promote.domain.ports import CandidateReader, RoleDirectory
from backend.tests.to_promote.support import (
    COMPLETE_BRIEF,
    NOW,
    a_candidate,
    a_deliverable,
    a_technical_inputs,
)

PARTNER = RequestContext("study-1", "user-1", Role.PARTNER)
ARCHITECT = RequestContext("study-1", "user-2", Role.ARCHITECT)


def build(candidates, roles=None):
    reader = create_autospec(CandidateReader, spec_set=True, instance=True)
    reader.list_candidates.return_value = candidates
    directory = create_autospec(RoleDirectory, spec_set=True, instance=True)
    directory.roles_by_project.return_value = roles or {}
    return ToPromoteQueue(reader, directory, clock=lambda: NOW), reader, directory


def ready_in_phase_3(code, since=NOW - timedelta(days=10)):
    return a_candidate(
        3, id=f"id-{code}", code=code, in_phase_since=since, deliverable=a_deliverable(3)
    )


def in_progress_in_phase_0(code, since=NOW - timedelta(days=10)):
    return a_candidate(0, id=f"id-{code}", code=code, in_phase_since=since, scored=False)


def blocked_in_phase_3(code, since=NOW - timedelta(days=10)):
    return a_candidate(
        3,
        id=f"id-{code}",
        code=code,
        in_phase_since=since,
        paused=True,
        expected_resumption=(NOW + timedelta(days=5)).date(),
        deliverable=a_deliverable(3),
    )


def test_an_empty_study_has_an_empty_list_and_a_zero_counter():
    queue, _, _ = build([])

    answer = queue.execute(PARTNER)

    assert answer.ready_count == 0
    assert answer.items == []


def test_ready_first_then_in_progress_then_blocked():
    queue, _, _ = build(
        [
            blocked_in_phase_3("PRY-1"),
            in_progress_in_phase_0("PRY-2"),
            ready_in_phase_3("PRY-3"),
        ]
    )

    answer = queue.execute(PARTNER)

    assert [(i.code, i.state) for i in answer.items] == [
        ("PRY-3", "ready"),
        ("PRY-2", "in_progress"),
        ("PRY-1", "blocked"),
    ]


def test_inside_a_group_the_oldest_in_the_phase_goes_first_then_the_code():
    old, new = NOW - timedelta(days=30), NOW - timedelta(days=2)
    queue, _, _ = build(
        [
            ready_in_phase_3("PRY-A", new),
            ready_in_phase_3("PRY-C", old),
            ready_in_phase_3("PRY-B", old),
        ]
    )

    answer = queue.execute(PARTNER)

    assert [i.code for i in answer.items] == ["PRY-B", "PRY-C", "PRY-A"]


def test_the_counter_counts_only_the_ready_ones():
    queue, _, _ = build(
        [ready_in_phase_3("PRY-1"), ready_in_phase_3("PRY-2"), in_progress_in_phase_0("PRY-3")]
    )

    assert queue.execute(PARTNER).ready_count == 2


def test_each_item_carries_the_phase_deliverable_promoter_and_reason():
    queue, _, _ = build([in_progress_in_phase_0("PRY-1")])

    (item,) = queue.execute(PARTNER).items

    assert item.phase == 0
    assert item.phase_name == "Oportunidad"
    assert item.deliverable.startswith("Scoring (7 criterios")
    assert item.promoter == "Socio o director"
    assert item.reason == "Falta: Scoring de la oportunidad."


def test_a_ready_item_has_no_reason():
    queue, _, _ = build([ready_in_phase_3("PRY-1")])

    (item,) = queue.execute(PARTNER).items

    assert item.reason is None


def test_a_blocked_item_says_when_the_pause_is_expected_to_end():
    queue, _, _ = build([blocked_in_phase_3("PRY-1")])

    (item,) = queue.execute(PARTNER).items

    assert item.reason == "En pausa; reanudación prevista el 06/11/2026."


def test_a_phase_brief_is_judged_with_its_technical_data():
    candidate = a_candidate(
        2,
        deliverable=a_deliverable(2, False, False, {"brief": COMPLETE_BRIEF}),
        technical=a_technical_inputs(),
    )
    queue, _, _ = build([candidate])

    (item,) = queue.execute(PARTNER).items

    assert item.state == "ready"


def test_can_promote_follows_the_studio_role_in_the_management_phases():
    queue, _, _ = build([in_progress_in_phase_0("PRY-1")])

    assert queue.execute(PARTNER).items[0].can_promote is True
    assert queue.execute(ARCHITECT).items[0].can_promote is False


def test_can_promote_follows_the_function_in_each_project():
    candidates = [
        a_candidate(2, id="id-1", code="PRY-1", technical=a_technical_inputs()),
        a_candidate(2, id="id-2", code="PRY-2", technical=a_technical_inputs()),
    ]
    roles = {"id-1": frozenset({ProjectRole.PROJECT_DIRECTOR})}
    queue, _, _ = build(candidates, roles)

    answer = queue.execute(ARCHITECT)

    assert {i.code: i.can_promote for i in answer.items} == {"PRY-1": True, "PRY-2": False}


def test_can_promote_is_independent_of_the_state_of_the_deliverable():
    queue, _, _ = build(
        [blocked_in_phase_3("PRY-1")], {"id-PRY-1": frozenset({ProjectRole.PROJECT_DIRECTOR})}
    )

    assert queue.execute(ARCHITECT).items[0].can_promote is True


def test_the_roles_are_read_once_for_the_whole_list_of_the_user():
    candidates = [ready_in_phase_3(f"PRY-{n}") for n in range(5)]
    queue, reader, directory = build(candidates)

    queue.execute(ARCHITECT)

    reader.list_candidates.assert_called_once_with()
    directory.roles_by_project.assert_called_once_with(ARCHITECT, [f"id-PRY-{n}" for n in range(5)])


def test_a_project_in_closing_is_never_listed_even_if_the_reader_returns_it():
    closing = a_candidate(7, id="id-7", code="PRY-7")
    queue, _, _ = build([closing, ready_in_phase_3("PRY-1")])

    answer = queue.execute(PARTNER)

    assert [i.code for i in answer.items] == ["PRY-1"]


def test_the_use_case_only_reads():
    queue, reader, directory = build([ready_in_phase_3("PRY-1")])

    queue.execute(PARTNER)

    assert {c[0] for c in reader.mock_calls} <= {"list_candidates"}
    assert {c[0] for c in directory.mock_calls} <= {"roles_by_project"}


def test_the_default_clock_is_utc():
    from backend.app.to_promote.application import queue as module

    assert module._utc_now().tzinfo is timezone.utc
    assert isinstance(module._utc_now(), datetime)
