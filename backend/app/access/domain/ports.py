"""Ports of the access context."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from backend.app.access.domain.assignment import Assignment
from backend.app.access.domain.project_roles import ProjectRole


@dataclass(frozen=True)
class ProjectRef:
    id: str
    code: str
    phase: int


class ProjectDirectory(Protocol):
    def find(self, code: str) -> ProjectRef | None: ...


class ProjectRoleReader(Protocol):
    def roles_of(self, project_id: str, user_id: str) -> frozenset[ProjectRole]:
        """Functions an active member (by their sign-in subject) holds in that project."""
        ...


class ProjectMembers(ProjectRoleReader, Protocol):
    """Assignments of the current study (row level security applies)."""

    def add(
        self,
        *,
        study_id: str,
        project_id: str,
        member_id: str,
        role: ProjectRole,
        assigned_by: str,
    ) -> Assignment:
        """Raise `AssignmentAlreadyExists` when the member already holds that function."""
        ...

    def remove(self, project_id: str, assignment_id: str) -> Assignment | None: ...

    def list_for_project(self, project_id: str) -> list[Assignment]: ...

