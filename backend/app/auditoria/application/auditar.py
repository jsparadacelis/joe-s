"""`audit()`: la utilidad que usan los servicios para dejar rastro de cada cambio."""

from __future__ import annotations

from typing import Any

from backend.app.auditoria.domain.evento import EventoDeAuditoria, Resultado
from backend.app.auditoria.domain.ports import RegistroDeAuditoria
from backend.app.estudio.domain.contexto import ContextoDeSolicitud


def audit(
    registro: RegistroDeAuditoria,
    contexto: ContextoDeSolicitud,
    *,
    entidad: str,
    entidad_id: str,
    accion: str,
    valor_anterior: Any | None = None,
    valor_nuevo: Any | None = None,
    version: int | None = None,
    resultado: Resultado = Resultado.OK,
) -> None:
    registro.registrar(
        EventoDeAuditoria(
            estudio_id=contexto.estudio_id,
            usuario_id=contexto.usuario_id,
            entidad=entidad,
            entidad_id=entidad_id,
            accion=accion,
            valor_anterior=valor_anterior,
            valor_nuevo=valor_nuevo,
            version=version,
            resultado=resultado,
        )
    )
