"""Ports of the briefing context."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class BriefProject:
    id: str
    code: str
    current_phase: int


class Briefs(Protocol):
    def get_project(self, code: str, *, lock: bool = False) -> BriefProject | None:
        """The project of the study; `lock` serializes concurrent writers (edit, promotion)
        of the same project until commit."""
        ...

    def get_brief(self, project_id: str) -> dict[str, Any]:
        """The brief draft kept in the phase 2 exit deliverable ({} when there is none)."""
        ...

    def save_brief(self, project_id: str, brief: dict[str, Any]) -> None:
        """Replace the brief draft (the deliverable is created if missing). The deliverable's
        `complete` and `approved` flags and its other keys are never changed."""
        ...

    def finalize(self, project_id: str, content: dict[str, Any]) -> None:
        """Replace the phase 2 exit deliverable content and leave it complete and approved."""
        ...

    def get_frozen(self, project_id: str, phase: int) -> dict[str, Any] | None:
        """Content of the latest frozen version of the phase, or None when there is none."""
        ...
