"""Contexto de cada petición: a qué estudio y usuario pertenece y con qué rol."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Rol(str, Enum):
    SOCIO = "socio"
    DIRECTOR = "director"
    DIRECTOR_DE_PROYECTO = "director_de_proyecto"
    LIDER_TECNICO = "lider_tecnico"
    ARQUITECTO = "arquitecto"
    COLABORADOR_DE_OBRA = "colaborador_de_obra"


class Habilitacion(str, Enum):
    """Atributos del usuario que dan autoridad en fases avanzadas (los asigna RGB-4)."""

    FIRMANTE_HABILITADO = "firmante_habilitado"
    DIRECCION_FACULTATIVA = "direccion_facultativa"
    SPONSOR = "sponsor"


@dataclass(frozen=True)
class ContextoDeSolicitud:
    estudio_id: str
    usuario_id: str
    rol: Rol
    habilitaciones: frozenset[Habilitacion] = frozenset()

    def __post_init__(self) -> None:
        for name in ("estudio_id", "usuario_id"):
            if not getattr(self, name).strip():
                raise ValueError(f"{name} no puede estar vacío")
