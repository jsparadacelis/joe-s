"""The "to promote" list: the state of every project's exit deliverable (RGB-12).

Read only: it never promotes, holds or writes anything (no AI path reaches it either). One read
of the projects and one of the person's functions serve the whole list.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone

from backend.app.access.application.actors import decide
from backend.app.access.domain.actions import Action as Permission
from backend.app.lifecycle.domain.phases import phase_definition
from backend.app.study.domain.context import RequestContext
from backend.app.to_promote.application.missing import missing_for
from backend.app.to_promote.domain.candidate import Candidate
from backend.app.to_promote.domain.ports import CandidateReader, RoleDirectory
from backend.app.to_promote.domain.readiness import (
    Readiness,
    ReadinessState,
    assess,
    is_listed,
    promoter_label,
)

# Display order of the states: ready first.
_STATE_ORDER = {ReadinessState.READY: 0, ReadinessState.IN_PROGRESS: 1, ReadinessState.BLOCKED: 2}


@dataclass(frozen=True)
class ToPromoteItem:
    code: str
    name: str
    phase: int
    phase_name: str
    deliverable: str
    state: str
    reason: str | None
    promoter: str
    can_promote: bool


@dataclass(frozen=True)
class ToPromoteList:
    ready_count: int
    items: list[ToPromoteItem]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ToPromoteQueue:
    def __init__(
        self,
        reader: CandidateReader,
        roles: RoleDirectory,
        clock: Callable[[], datetime] = _utc_now,
    ) -> None:
        self._reader = reader
        self._roles = roles
        self._clock = clock

    def execute(self, context: RequestContext) -> ToPromoteList:
        today = self._clock().astimezone(timezone.utc).date()
        candidates = [c for c in self._reader.list_candidates() if is_listed(c.phase)]
        roles = self._roles.roles_by_project(context, [c.id for c in candidates])
        judged = []
        for candidate in candidates:
            readiness = assess(
                phase=candidate.phase,
                paused=candidate.paused,
                expected_resumption=candidate.expected_resumption,
                missing=missing_for(candidate),
                today=today,
            )
            allowed = decide(
                context,
                Permission.PROMOTE,
                candidate.id,
                candidate.phase,
                roles.get(candidate.id, frozenset()),
            ).allowed
            judged.append((candidate, readiness, allowed))
        judged.sort(key=lambda row: _sort_key(row[0], row[1].state))
        items = [_item(candidate, readiness, allowed) for candidate, readiness, allowed in judged]
        return ToPromoteList(sum(i.state == ReadinessState.READY for i in items), items)


def _sort_key(candidate: Candidate, state: ReadinessState) -> tuple:
    return (_STATE_ORDER[state], candidate.in_phase_since, candidate.code)


def _item(candidate: Candidate, readiness: Readiness, allowed: bool) -> ToPromoteItem:
    definition = phase_definition(candidate.phase)
    return ToPromoteItem(
        code=candidate.code,
        name=candidate.name,
        phase=candidate.phase,
        phase_name=definition.name,
        deliverable=definition.exit_deliverable,
        state=readiness.state.value,
        reason=readiness.reason,
        promoter=promoter_label(candidate.phase),
        can_promote=allowed,
    )
