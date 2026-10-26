"""What the action is about: a project (at its current phase) or the studio as a whole."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ProjectResource:
    project_id: str
    phase: int


@dataclass(frozen=True)
class StudyResource:
    pass


Resource = ProjectResource | StudyResource
