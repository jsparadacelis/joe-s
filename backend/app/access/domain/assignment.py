"""One function a member holds in one project."""

from __future__ import annotations

from dataclasses import dataclass

from backend.app.access.domain.project_roles import ProjectRole


@dataclass(frozen=True)
class Assignment:
    id: str
    study_id: str
    project_id: str
    member_id: str
    role: ProjectRole
