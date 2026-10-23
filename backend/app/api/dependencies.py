"""Dependencias de FastAPI compartidas por las rutas."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import AbstractContextManager, contextmanager
from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from backend.app.auditoria.infrastructure.postgres_registro import PostgresRegistroDeAuditoria
from backend.app.ciclo_de_vida.application.servicio_promocion import ServicioDePromocion
from backend.app.ciclo_de_vida.application.validadores import VALIDADORES_POR_FASE
from backend.app.ciclo_de_vida.infrastructure.postgres_ciclo_de_vida import PostgresCicloDeVida
from backend.app.estudio.domain.contexto import ContextoDeSolicitud, Habilitacion, Rol
from backend.app.shared.config import Settings
from backend.app.shared.db import transaccion_de_estudio


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
        rol=Rol(settings.dev_rol),
        habilitaciones=frozenset(Habilitacion(h) for h in settings.dev_habilitaciones),
    )


UnidadDeTrabajo = Callable[[ContextoDeSolicitud], AbstractContextManager[ServicioDePromocion]]


def unidad_de_trabajo(settings: Annotated[Settings, Depends(get_settings)]) -> UnidadDeTrabajo:
    """Raíz de composición: una transacción por petición con el estudio fijado."""

    @contextmanager
    def abrir(contexto: ContextoDeSolicitud) -> Iterator[ServicioDePromocion]:
        with transaccion_de_estudio(settings.database_url, contexto) as conn:
            yield ServicioDePromocion(
                PostgresCicloDeVida(conn),
                PostgresRegistroDeAuditoria(conn),
                VALIDADORES_POR_FASE,
            )

    return abrir
