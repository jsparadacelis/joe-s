"""Ask the central policy before a study-wide action; refuse with `NotPermitted`."""

from __future__ import annotations

from backend.app.access.application.actors import person_actor
from backend.app.access.domain.actions import Action
from backend.app.access.domain.errors import NotPermitted
from backend.app.access.domain.policy import can
from backend.app.access.domain.resource import StudyResource
from backend.app.study.domain.context import RequestContext


def require(context: RequestContext, action: Action) -> None:
    if not can(person_actor(context), action, StudyResource()).allowed:
        raise NotPermitted(action.value)
