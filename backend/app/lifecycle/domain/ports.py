"""Lifecycle ports."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    from backend.app.lifecycle.domain.deliverable import ExitDeliverable
    from backend.app.lifecycle.domain.frozen_version import FrozenVersion
    from backend.app.lifecycle.domain.project import Project
    from backend.app.lifecycle.domain.promotion import Promotion


class DeliverableValidator(Protocol):
    """Each phase provides its own: returns what is missing from the content (empty if ready)."""

    def validate(self, content: dict[str, Any]) -> list[str]: ...


class LifecycleRepository(Protocol):
    def get_project(self, code: str) -> Project | None:
        """Returns it locked for the current transaction."""
        ...

    def get_deliverable(self, project_id: str, phase: int) -> ExitDeliverable | None: ...

    def next_version(self, project_id: str, phase: int) -> int: ...

    def freeze(self, version: FrozenVersion) -> None: ...

    def record_promotion(self, promotion: Promotion) -> None: ...

    def change_phase(self, project_id: str, phase: int) -> None: ...

    def open_deliverable(self, project_id: str, phase: int) -> None: ...
