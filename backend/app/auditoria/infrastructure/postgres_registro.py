"""Adaptador Postgres: escribe con la conexión de la transacción de negocio (atómico)."""

from __future__ import annotations

import psycopg
from psycopg.types.json import Jsonb

from backend.app.auditoria.domain.evento import EventoDeAuditoria


def _json(value):
    return None if value is None else Jsonb(value)


class PostgresRegistroDeAuditoria:
    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def registrar(self, evento: EventoDeAuditoria) -> None:
        self._conn.execute(
            "INSERT INTO eventos_auditoria (estudio_id, usuario_id, entidad, entidad_id, accion, "
            "version, valor_anterior, valor_nuevo, resultado) "
            "VALUES (%s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)",
            (
                evento.estudio_id,
                evento.usuario_id,
                evento.entidad,
                evento.entidad_id,
                evento.accion,
                evento.version,
                _json(evento.valor_anterior),
                _json(evento.valor_nuevo),
                evento.resultado.value,
            ),
        )
