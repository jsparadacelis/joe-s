"""Exit deliverable of a phase."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.app.lifecycle.domain.ports import DeliverableValidator


@dataclass(frozen=True)
class ExitDeliverable:
    phase: int
    content: dict[str, Any]
    complete: bool
    approved: bool

    def missing(self, validator: DeliverableValidator | None = None) -> list[str]:
        missing = []
        if not self.complete:
            missing.append("entregable de salida completo")
        if not self.approved:
            missing.append("aprobación del entregable")
        if validator is not None:
            missing.extend(validator.validate(self.content))
        return missing
