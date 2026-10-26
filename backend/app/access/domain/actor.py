"""Who asks: a person (with their roles in the project at hand) or an AI agent."""

from __future__ import annotations

from dataclasses import dataclass

from backend.app.access.domain.project_roles import ProjectRole
from backend.app.study.domain.context import Qualification, Role


@dataclass(frozen=True)
class PersonActor:
    study_id: str
    user_id: str
    study_role: Role
    qualifications: frozenset[Qualification] = frozenset()
    # The person's functions in the project of the resource being asked about.
    project_roles: frozenset[ProjectRole] = frozenset()


@dataclass(frozen=True)
class AiActor:
    """An AI agent only proposes: it may read, it never changes a state."""

    name: str


Actor = PersonActor | AiActor
