"""From the request context to the actor the permission function understands."""

from __future__ import annotations

from backend.app.access.domain.actions import Action
from backend.app.access.domain.actor import PersonActor
from backend.app.access.domain.policy import Decision, can
from backend.app.access.domain.project_roles import ProjectRole
from backend.app.access.domain.resource import ProjectResource
from backend.app.study.domain.context import RequestContext


def person_actor(
    context: RequestContext, project_roles: frozenset[ProjectRole] = frozenset()
) -> PersonActor:
    return PersonActor(
        study_id=context.study_id,
        user_id=context.user_id,
        study_role=context.role,
        qualifications=context.qualifications,
        project_roles=project_roles,
    )


def decide(
    context: RequestContext,
    action: Action,
    project_id: str,
    phase: int,
    project_roles: frozenset[ProjectRole] = frozenset(),
) -> Decision:
    """Ask the central policy about a project. Phases 0 and 1 are held by studio roles, so
    callers working only there need not load the person's functions in the project."""
    return can(
        person_actor(context, project_roles),
        action,
        ProjectResource(project_id=project_id, phase=phase),
    )
