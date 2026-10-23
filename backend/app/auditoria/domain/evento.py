"""Evento de auditoría: quién, qué, cuándo (lo fija la base), versión y resultado."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class Resultado(str, Enum):
    OK = "ok"
    RECHAZADO = "rechazado"


@dataclass(frozen=True)
class EventoDeAuditoria:
    estudio_id: str
    usuario_id: str
    entidad: str
    entidad_id: str
    accion: str
    valor_anterior: Any | None = None
    valor_nuevo: Any | None = None
    version: int | None = None
    resultado: Resultado = Resultado.OK

    def __post_init__(self) -> None:
        for name in ("estudio_id", "usuario_id", "entidad", "entidad_id", "accion"):
            if not getattr(self, name).strip():
                raise ValueError(f"{name} no puede estar vacío")
        if self.version is not None and self.version < 1:
            raise ValueError("version debe ser 1 o mayor")
