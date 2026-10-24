"""Portfolio errors. Messages are user-facing Spanish text."""

from __future__ import annotations


class ProjectNotFound(Exception):
    code = "project_not_found"

    def __init__(self, project_code: str) -> None:
        self.project_code = project_code
        super().__init__(f"No existe el proyecto {project_code}.")
