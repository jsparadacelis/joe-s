"""Dependencias de FastAPI compartidas por las rutas."""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from backend.app.estudio.domain.contexto import ContextoDeSolicitud, Rol
from backend.app.shared.config import Settings


@lru_cache
def get_settings() -> Settings:
    return Settings()


def contexto_de_solicitud(
    settings: Annotated[Settings, Depends(get_settings)],
) -> ContextoDeSolicitud:
    """Contexto fijo y ficticio de desarrollo. RGB-2 lo sustituirá por la sesión real."""
    return ContextoDeSolicitud(
        estudio_id=settings.dev_estudio_id,
        usuario_id=settings.dev_usuario_id,
        rol=Rol.SOCIO,
    )
