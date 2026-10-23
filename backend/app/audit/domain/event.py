"""Audit event: who, what, when (set by the database), version and outcome."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class Outcome(str, Enum):
    OK = "ok"
    REJECTED = "rejected"


@dataclass(frozen=True)
class AuditEvent:
    study_id: str
    user_id: str
    entity: str
    entity_id: str
    action: str
    old_value: Any | None = None
    new_value: Any | None = None
    version: int | None = None
    outcome: Outcome = Outcome.OK

    def __post_init__(self) -> None:
        for name in ("study_id", "user_id", "entity", "entity_id", "action"):
            if not getattr(self, name).strip():
                raise ValueError(f"{name} no puede estar vacío")
        if self.version is not None and self.version < 1:
            raise ValueError("version debe ser 1 o mayor")
