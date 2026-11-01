"""Ports of the "to promote" context (read side only)."""

from __future__ import annotations

from typing import Protocol

from backend.app.access.domain.project_roles import ProjectRole
from backend.app.study.domain.context import RequestContext
from backend.app.to_promote.domain.candidate import Candidate


class CandidateReader(Protocol):
    def list_candidates(self) -> list[Candidate]:
        """Every project of the study that may still be promoted (phases 0 to 6, not
        discarded), loaded in bulk."""
        ...


class RoleDirectory(Protocol):
    def roles_by_project(
        self, context: RequestContext, project_ids: list[str]
    ) -> dict[str, frozenset[ProjectRole]]:
        """The functions the person holds in each project, in one read; a project without
        entry means no function."""
        ...
