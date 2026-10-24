"""Ports of the pause use cases."""

from __future__ import annotations

from datetime import date
from typing import Protocol

from backend.app.timing.domain.pause import NewPause, PausableProject, Pause


class PauseRepository(Protocol):
    def get_project(self, code: str, *, lock: bool = True) -> PausableProject | None:
        """The project of the study; locked for the current transaction unless `lock` is off."""
        ...

    def get_open_pause(self, project_id: str) -> Pause | None: ...

    def add(self, new: NewPause) -> Pause: ...

    def close(self, pause_id: str, resumed_on: date, closed_by: str) -> Pause: ...

    def set_paused(self, project_id: str, paused: bool) -> None:
        """Keeps `projects.paused` in step with the open pause."""
        ...

    def list_pauses(self, project_id: str) -> list[Pause]:
        """Newest first: the open pause (if any) and then the closed ones."""
        ...
