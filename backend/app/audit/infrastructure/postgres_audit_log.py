"""Postgres adapter: writes on the business transaction's connection (atomic)."""

from __future__ import annotations

import psycopg
from psycopg.types.json import Jsonb

from backend.app.audit.domain.event import AuditEvent


def _json(value):
    return None if value is None else Jsonb(value)


class PostgresAuditLog:
    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def record(self, event: AuditEvent) -> None:
        self._conn.execute(
            "INSERT INTO audit_events (study_id, user_id, entity, entity_id, action, "
            "version, old_value, new_value, outcome) "
            "VALUES (%s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)",
            (
                event.study_id,
                event.user_id,
                event.entity,
                event.entity_id,
                event.action,
                event.version,
                _json(event.old_value),
                _json(event.new_value),
                event.outcome.value,
            ),
        )
