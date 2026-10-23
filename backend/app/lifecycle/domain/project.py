"""Project: one phase at a time; "active" needs responsible, milestone and traffic light."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from backend.app.lifecycle.domain.phases import validate_phase


class TrafficLight(str, Enum):
    GREEN = "green"
    AMBER = "amber"
    RED = "red"


class IncompleteProject(ValueError):
    def __init__(self, missing: list[str]) -> None:
        self.missing = missing
        super().__init__("Para activar el proyecto falta: " + ", ".join(missing))


@dataclass(frozen=True)
class Project:
    study_id: str
    code: str
    name: str
    current_phase: int
    active: bool = False
    paused: bool = False
    responsible_id: str | None = None
    next_milestone: str | None = None
    traffic_light: TrafficLight | None = None
    id: str | None = None

    def __post_init__(self) -> None:
        for name in ("study_id", "code", "name"):
            if not getattr(self, name).strip():
                raise ValueError(f"{name} no puede estar vacío")
        validate_phase(self.current_phase)
        if self.active and (missing := self.missing_for_activation()):
            raise IncompleteProject(missing)

    def missing_for_activation(self) -> list[str]:
        missing = []
        if not (self.responsible_id or "").strip():
            missing.append("responsable")
        if not (self.next_milestone or "").strip():
            missing.append("próximo hito")
        if self.traffic_light is None:
            missing.append("semáforo")
        return missing
