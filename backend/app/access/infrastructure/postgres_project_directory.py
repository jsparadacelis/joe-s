"""Finds a project of the current study by its code."""

from __future__ import annotations

import psycopg

from backend.app.access.domain.ports import ProjectRef


class PostgresProjectDirectory:
    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def find(self, code: str) -> ProjectRef | None:
        row = self._conn.execute(
            "SELECT id::text, code, current_phase FROM projects WHERE code = %s", (code,)
        ).fetchone()
        return None if row is None else ProjectRef(id=row[0], code=row[1], phase=row[2])
