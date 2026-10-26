"""Promote, hold and do-not-pursue. Rejections are returned (not raised) so the
transaction commits and the attempt stays in the audit log."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.app.access.application.actors import person_actor
from backend.app.access.domain.actions import Action as Permission
from backend.app.access.domain.policy import can
from backend.app.access.domain.ports import ProjectRoleReader
from backend.app.access.domain.resource import ProjectResource
from backend.app.audit.application.record import audit
from backend.app.audit.domain.event import Outcome
from backend.app.audit.domain.ports import AuditLog
from backend.app.lifecycle.domain.errors import (
    ActionNotAllowed,
    BusinessError,
    IncompleteDeliverable,
    NoAuthority,
    NoNextPhase,
    ProjectNotFound,
    ReasonRequired,
)
from backend.app.lifecycle.domain.frozen_version import FrozenVersion
from backend.app.lifecycle.domain.phases import LAST_PHASE
from backend.app.lifecycle.domain.ports import DeliverableValidator, LifecycleRepository
from backend.app.lifecycle.domain.project import Project
from backend.app.lifecycle.domain.promotion import Action, Promotion
from backend.app.study.domain.context import RequestContext


@dataclass(frozen=True)
class Transition:
    ok: bool
    action: str
    previous_phase: int
    current_phase: int
    frozen_version: int | None
    error: BusinessError | None


class PromotionService:
    def __init__(
        self,
        repo: LifecycleRepository,
        audit: AuditLog,
        validators: dict[int, DeliverableValidator],
        project_roles: ProjectRoleReader,
    ) -> None:
        self._repo = repo
        self._audit_log = audit
        self._validadores = validators
        self._project_roles = project_roles

    def promote(self, context: RequestContext, code: str) -> Transition:
        project = self._load(code)
        phase = project.current_phase
        if phase >= LAST_PHASE:
            return self._reject(context, project, "promote", NoNextPhase())
        if (error := self._missing_authority(context, project)) is not None:
            return self._reject(context, project, "promote", error)

        deliverable = self._repo.get_deliverable(project.id, phase)
        if deliverable is None:
            missing = ["entregable de salida"]
        else:
            missing = deliverable.missing(self._validadores.get(phase))
        if missing:
            return self._reject(context, project, "promote", IncompleteDeliverable(missing))

        version = self._repo.next_version(project.id, phase)
        self._repo.freeze(
            FrozenVersion.create(
                study_id=project.study_id,
                project_id=project.id,
                phase=phase,
                version=version,
                content=deliverable.content,
                frozen_by=context.user_id,
            )
        )
        self._repo.record_promotion(
            Promotion(
                study_id=project.study_id,
                project_id=project.id,
                action=Action.PROMOTE,
                from_phase=phase,
                to_phase=phase + 1,
                user_id=context.user_id,
            )
        )
        self._repo.change_phase(project.id, phase + 1)
        self._repo.open_deliverable(project.id, phase + 1)
        self._audit(context, code, "promote", {"phase": phase}, {"phase": phase + 1}, version)
        return Transition(True, "promote", phase, phase + 1, version, None)

    def hold(self, context: RequestContext, code: str, reason: str | None) -> Transition:
        return self._decide(context, code, Action.HOLD, reason)

    def do_not_pursue(self, context: RequestContext, code: str, reason: str | None) -> Transition:
        return self._decide(context, code, Action.DO_NOT_PURSUE, reason)

    def _decide(
        self, context: RequestContext, code: str, action: Action, reason: str | None
    ) -> Transition:
        project = self._load(code)
        phase = project.current_phase
        if action is Action.DO_NOT_PURSUE and phase != 0:
            return self._reject(context, project, action.value, ActionNotAllowed(action.value))
        if (error := self._missing_authority(context, project)) is not None:
            return self._reject(context, project, action.value, error)
        if not (reason or "").strip():
            return self._reject(context, project, action.value, ReasonRequired(action.value))

        self._repo.record_promotion(
            Promotion(
                study_id=project.study_id,
                project_id=project.id,
                action=action,
                from_phase=phase,
                user_id=context.user_id,
                reason=reason,
            )
        )
        self._audit(
            context, code, action.value, {"phase": phase}, {"phase": phase, "reason": reason}, None
        )
        return Transition(True, action.value, phase, phase, None, None)

    def _load(self, code: str) -> Project:
        project = self._repo.get_project(code)
        if project is None:
            raise ProjectNotFound(code)
        return project

    def _missing_authority(self, context: RequestContext, project: Project) -> NoAuthority | None:
        roles = self._project_roles.roles_of(project.id, context.user_id)
        decision = can(
            person_actor(context, roles),
            Permission.PROMOTE,
            ProjectResource(project_id=project.id, phase=project.current_phase),
        )
        if decision.allowed:
            return None
        return NoAuthority(project.current_phase, list(decision.who))

    def _reject(
        self, context: RequestContext, project: Project, action: str, error: BusinessError
    ) -> Transition:
        self._audit(
            context,
            project.code,
            action,
            {"phase": project.current_phase},
            {"error": error.code},
            None,
            Outcome.REJECTED,
        )
        phase = project.current_phase
        return Transition(False, action, phase, phase, None, error)

    def _audit(
        self,
        context: RequestContext,
        code: str,
        action: str,
        old: Any,
        new: Any,
        version: int | None,
        outcome: Outcome = Outcome.OK,
    ) -> None:
        audit(
            self._audit_log,
            context,
            entity="project",
            entity_id=code,
            action=action,
            old_value=old,
            new_value=new,
            version=version,
            outcome=outcome,
        )
