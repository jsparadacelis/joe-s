"""Ports of the portfolio context (read side)."""

from __future__ import annotations

from typing import Protocol

from backend.app.portfolio.domain.project import ProjectRecord


class ProjectReader(Protocol):
    def list_projects(self) -> list[ProjectRecord]:
        """Every project of the study."""
        ...

    def find(self, code: str) -> ProjectRecord | None: ...
