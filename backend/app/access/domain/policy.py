"""The central permission function. Nobody else decides who may do what.

The promotion matrix comes from the PRD table "Entregable de salida por fase"."""

from __future__ import annotations

from dataclasses import dataclass

from backend.app.access.domain.actions import Action
from backend.app.access.domain.actor import Actor, AiActor, PersonActor
from backend.app.access.domain.project_roles import ProjectRole
from backend.app.access.domain.resource import ProjectResource, Resource
from backend.app.lifecycle.domain.phases import validate_phase
from backend.app.study.domain.context import Role

_MANAGEMENT = frozenset({Role.PARTNER, Role.DIRECTOR})

# Phase -> (studio roles, project role) that hold it. Exactly one of the two applies.
_PHASE_AUTHORITY: dict[int, tuple[frozenset[Role], ProjectRole | None]] = {
    0: (_MANAGEMENT, None),
    1: (_MANAGEMENT, None),
    2: (frozenset(), ProjectRole.PROJECT_DIRECTOR),
    3: (frozenset(), ProjectRole.PROJECT_DIRECTOR),
    4: (frozenset(), ProjectRole.LICENSED_SIGNATORY),
    5: (frozenset(), ProjectRole.LICENSED_SIGNATORY),
    6: (frozenset(), ProjectRole.SITE_MANAGEMENT),
    7: (frozenset(), ProjectRole.SPONSOR),
}

_LABELS = {
    Role.PARTNER: "Socio",
    Role.DIRECTOR: "Director",
    ProjectRole.PROJECT_DIRECTOR: "Director de proyecto",
    ProjectRole.LICENSED_SIGNATORY: "Firmante habilitado",
    ProjectRole.SITE_MANAGEMENT: "Dirección facultativa",
    ProjectRole.SPONSOR: "Sponsor",
}

_PHASE_ACTIONS = frozenset(
    {Action.PROMOTE, Action.APPROVE_DELIVERABLE, Action.EDIT_DELIVERABLE}
)
_PROJECT_RUNNING = frozenset({Action.PAUSE, Action.RESUME, Action.MANAGE_PROJECT_MEMBERS})
_MANAGEMENT_ONLY = frozenset({Action.EDIT_SETTINGS, Action.SCORE, Action.MANAGE_STUDY_MEMBERS})


@dataclass(frozen=True)
class Decision:
    allowed: bool
    # Who can do it, as user-facing labels: filled in when the answer is no.
    who: tuple[str, ...] = ()


def who_promotes(phase: int) -> tuple[str, ...]:
    studio_roles, project_role = _PHASE_AUTHORITY[validate_phase(phase)]
    if project_role is not None:
        return (_LABELS[project_role],)
    return tuple(_LABELS[role] for role in (Role.PARTNER, Role.DIRECTOR) if role in studio_roles)


def can(actor: Actor, action: Action, resource: Resource) -> Decision:
    if isinstance(actor, AiActor):
        return Decision(action is Action.READ)
    if action is Action.READ:
        return Decision(True)
    if action in _PHASE_ACTIONS:
        return _phase_decision(actor, resource)
    if action in _PROJECT_RUNNING:
        return _flag(_is_management(actor) or ProjectRole.PROJECT_DIRECTOR in actor.project_roles)
    if action in _MANAGEMENT_ONLY:
        return _flag(_is_management(actor))
    if action is Action.CREATE_OPPORTUNITY:
        return _flag(_is_management(actor) or actor.study_role is Role.PROJECT_DIRECTOR)
    return Decision(False)


def _phase_decision(actor: PersonActor, resource: Resource) -> Decision:
    if not isinstance(resource, ProjectResource):
        return Decision(False)
    studio_roles, project_role = _PHASE_AUTHORITY[validate_phase(resource.phase)]
    allowed = actor.study_role in studio_roles or (
        project_role is not None and project_role in actor.project_roles
    )
    return Decision(allowed, () if allowed else who_promotes(resource.phase))


def _is_management(actor: PersonActor) -> bool:
    return actor.study_role in _MANAGEMENT


def _flag(allowed: bool) -> Decision:
    return Decision(allowed)
