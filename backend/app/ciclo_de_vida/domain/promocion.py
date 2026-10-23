"""Registro de una promoción, retención o decisión de no perseguir."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from backend.app.ciclo_de_vida.domain.fases import ULTIMA_FASE, validar_fase


class Accion(str, Enum):
    PROMOVER = "promover"
    RETENER = "retener"
    NO_PERSEGUIR = "no_perseguir"


class ResultadoPromocion(str, Enum):
    OK = "ok"
    RECHAZADO = "rechazado"


@dataclass(frozen=True, kw_only=True)
class Promocion:
    estudio_id: str
    proyecto_id: str
    accion: Accion
    de_fase: int
    a_fase: int | None = None
    usuario_id: str
    motivo: str | None = None
    resultado: ResultadoPromocion = ResultadoPromocion.OK

    def __post_init__(self) -> None:
        validar_fase(self.de_fase)
        if self.accion is Accion.PROMOVER:
            if self.de_fase >= ULTIMA_FASE or self.a_fase != self.de_fase + 1:
                raise ValueError("promover solo avanza a la fase siguiente")
            return
        if self.a_fase is not None:
            raise ValueError(f"{self.accion.value} no tiene fase de destino")
        if not (self.motivo or "").strip():
            raise ValueError(f"{self.accion.value} exige un motivo")
        if self.accion is Accion.NO_PERSEGUIR and self.de_fase != 0:
            raise ValueError("no perseguir solo es posible en la fase 0 (Oportunidad)")
