"""Versión congelada del entregable de salida: inmutable desde que se crea."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from backend.app.ciclo_de_vida.domain.fases import validar_fase


@dataclass(frozen=True)
class VersionCongelada:
    estudio_id: str
    proyecto_id: str
    fase: int
    version: int
    contenido_json: str
    congelada_por: str

    @classmethod
    def crear(
        cls,
        *,
        estudio_id: str,
        proyecto_id: str,
        fase: int,
        version: int,
        contenido: dict[str, Any],
        congelada_por: str,
    ) -> VersionCongelada:
        try:
            serializado = json.dumps(contenido, sort_keys=True)
        except TypeError as error:
            raise ValueError("el contenido debe ser serializable a JSON") from error
        return cls(estudio_id, proyecto_id, fase, version, serializado, congelada_por)

    def __post_init__(self) -> None:
        validar_fase(self.fase)
        if self.version < 1:
            raise ValueError("version debe ser 1 o mayor")

    @property
    def contenido(self) -> dict[str, Any]:
        """Copia nueva en cada lectura: modificarla no altera la versión."""
        return json.loads(self.contenido_json)
