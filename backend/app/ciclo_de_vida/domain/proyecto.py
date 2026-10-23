"""Proyecto: una sola fase a la vez; «activo» exige responsable, próximo hito y semáforo."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from backend.app.ciclo_de_vida.domain.fases import validar_fase


class Semaforo(str, Enum):
    VERDE = "verde"
    AMBAR = "ambar"
    ROJO = "rojo"


class ProyectoIncompleto(ValueError):
    def __init__(self, faltantes: list[str]) -> None:
        self.faltantes = faltantes
        super().__init__("Para activar el proyecto falta: " + ", ".join(faltantes))


@dataclass(frozen=True)
class Proyecto:
    estudio_id: str
    codigo: str
    nombre: str
    fase_actual: int
    activo: bool = False
    en_pausa: bool = False
    responsable_id: str | None = None
    proximo_hito: str | None = None
    semaforo: Semaforo | None = None
    id: str | None = None

    def __post_init__(self) -> None:
        for name in ("estudio_id", "codigo", "nombre"):
            if not getattr(self, name).strip():
                raise ValueError(f"{name} no puede estar vacío")
        validar_fase(self.fase_actual)
        if self.activo and (faltantes := self.faltantes_para_activar()):
            raise ProyectoIncompleto(faltantes)

    def faltantes_para_activar(self) -> list[str]:
        faltantes = []
        if not (self.responsable_id or "").strip():
            faltantes.append("responsable")
        if not (self.proximo_hito or "").strip():
            faltantes.append("próximo hito")
        if self.semaforo is None:
            faltantes.append("semáforo")
        return faltantes
