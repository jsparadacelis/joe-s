"""Pause and resume a project. Rejections are returned (not raised) so the transaction commits
and a refused attempt for lack of permission stays in the audit log, as in the promotion."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any

from backend.app.audit.application.record import audit
from backend.app.audit.domain.event import Outcome
from backend.app.audit.domain.ports import AuditLog
from backend.app.study.domain.context import RequestContext
from backend.app.timing.domain.errors import (
    AlreadyPaused,
    CannotPauseOpportunity,
    NotAllowed,
    NotPaused,
    PauseError,
    ProjectNotFound,
)
from backend.app.timing.domain.pause import (
    NewPause,
    PausableProject,
    Pause,
    PauseRequest,
    can_manage_pauses,
)
from backend.app.timing.domain.ports import PauseRepository


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class PauseView:
    """A pause with its overdue indicator computed for the day of the request."""

    pause: Pause
    overdue: bool
    days_overdue: int

    @classmethod
    def of(cls, pause: Pause, today: date) -> PauseView:
        return cls(pause, pause.overdue(today), pause.days_overdue(today))


@dataclass(frozen=True)
class PauseResult:
    view: PauseView | None = None
    error: PauseError | None = None


@dataclass(frozen=True)
class PauseHistory:
    active: PauseView | None
    history: list[PauseView]


class PauseService:
    def __init__(
        self,
        repo: PauseRepository,
        audit_log: AuditLog,
        clock: Callable[[], datetime] = _utc_now,
    ) -> None:
        self._repo = repo
        self._audit_log = audit_log
        self._clock = clock

    def pause(self, context: RequestContext, code: str, data: Mapping[str, Any]) -> PauseResult:
        """Check order (contract): project (404), permission (403), phase 0 (422), fields
        (422), already paused (409)."""
        project = self._load(code)
        today = self._today()
        if not can_manage_pauses(context):
            return self._reject(context, project, "pause_project", NotAllowed())
        if not project.has_clock:
            return PauseResult(error=CannotPauseOpportunity())
        try:
            request = PauseRequest.from_input(data, today)
        except PauseError as error:
            return PauseResult(error=error)
        if self._repo.get_open_pause(project.id) is not None:
            return PauseResult(error=AlreadyPaused())

        pause = self._repo.add(
            NewPause(
                study_id=project.study_id,
                project_id=project.id,
                phase=project.current_phase,
                reason=request.reason,
                started_on=today,
                expected_resumption=request.expected_resumption,
                opened_by=context.user_id,
            )
        )
        self._repo.set_paused(project.id, True)
        self._audit(
            context,
            project,
            "pause_project",
            old={"paused": False},
            new={
                "phase": pause.phase,
                "reason": pause.reason.value,
                "started_on": pause.started_on.isoformat(),
                "expected_resumption": pause.expected_resumption.isoformat(),
            },
        )
        return PauseResult(view=PauseView.of(pause, today))

    def resume(self, context: RequestContext, code: str) -> PauseResult:
        project = self._load(code)
        today = self._today()
        if not can_manage_pauses(context):
            return self._reject(context, project, "resume_project", NotAllowed())
        open_pause = self._repo.get_open_pause(project.id)
        if open_pause is None:
            return PauseResult(error=NotPaused())

        closed = self._repo.close(open_pause.id, today, context.user_id)
        self._repo.set_paused(project.id, False)
        self._audit(
            context,
            project,
            "resume_project",
            old={
                "phase": open_pause.phase,
                "reason": open_pause.reason.value,
                "started_on": open_pause.started_on.isoformat(),
                "expected_resumption": open_pause.expected_resumption.isoformat(),
            },
            new={"phase": closed.phase, "resumed_on": today.isoformat()},
        )
        return PauseResult(view=PauseView.of(closed, today))

    def history(self, code: str) -> PauseHistory:
        project = self._repo.get_project(code, lock=False)
        if project is None:
            raise ProjectNotFound(code)
        today = self._today()
        views = [PauseView.of(p, today) for p in self._repo.list_pauses(project.id)]
        active = next((v for v in views if v.pause.is_open), None)
        return PauseHistory(active, [v for v in views if not v.pause.is_open])

    def _load(self, code: str) -> PausableProject:
        project = self._repo.get_project(code)
        if project is None:
            raise ProjectNotFound(code)
        return project

    def _today(self) -> date:
        return self._clock().astimezone(timezone.utc).date()

    def _reject(
        self, context: RequestContext, project: PausableProject, action: str, error: PauseError
    ) -> PauseResult:
        self._audit(
            context,
            project,
            action,
            old={"phase": project.current_phase},
            new={"error": error.code},
            outcome=Outcome.REJECTED,
        )
        return PauseResult(error=error)

    def _audit(
        self,
        context: RequestContext,
        project: PausableProject,
        action: str,
        *,
        old: Any,
        new: Any,
        outcome: Outcome = Outcome.OK,
    ) -> None:
        audit(
            self._audit_log,
            context,
            entity="project",
            entity_id=project.code,
            action=action,
            old_value=old,
            new_value=new,
            outcome=outcome,
        )
