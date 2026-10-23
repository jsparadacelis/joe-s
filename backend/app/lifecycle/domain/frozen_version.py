"""Frozen version of the exit deliverable: immutable from creation."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from backend.app.lifecycle.domain.phases import validate_phase


@dataclass(frozen=True)
class FrozenVersion:
    study_id: str
    project_id: str
    phase: int
    version: int
    content_json: str
    frozen_by: str

    @classmethod
    def create(
        cls,
        *,
        study_id: str,
        project_id: str,
        phase: int,
        version: int,
        content: dict[str, Any],
        frozen_by: str,
    ) -> FrozenVersion:
        try:
            serialized = json.dumps(content, sort_keys=True)
        except TypeError as error:
            raise ValueError("content must be JSON serializable") from error
        return cls(study_id, project_id, phase, version, serialized, frozen_by)

    def __post_init__(self) -> None:
        validate_phase(self.phase)
        if self.version < 1:
            raise ValueError("version debe ser 1 o mayor")

    @property
    def content(self) -> dict[str, Any]:
        """A new copy on every read: changing it does not alter the version."""
        return json.loads(self.content_json)
