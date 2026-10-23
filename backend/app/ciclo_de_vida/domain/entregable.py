"""Entregable de salida de una fase."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.app.ciclo_de_vida.domain.ports import ValidadorDeEntregable


@dataclass(frozen=True)
class EntregableDeSalida:
    fase: int
    contenido: dict[str, Any]
    completo: bool
    aprobado: bool

    def faltantes(self, validador: ValidadorDeEntregable | None = None) -> list[str]:
        faltantes = []
        if not self.completo:
            faltantes.append("entregable de salida completo")
        if not self.aprobado:
            faltantes.append("aprobación del entregable")
        if validador is not None:
            faltantes.extend(validador.validar(self.contenido))
        return faltantes
