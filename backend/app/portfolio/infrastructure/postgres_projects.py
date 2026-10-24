"""Postgres adapter for the portfolio reads: RLS limits every query to the study."""

from __future__ import annotations

import psycopg

from backend.app.portfolio.domain.project import ProjectRecord

_COLUMNS = (
    "code, name, current_phase, paused, traffic_light, next_milestone, responsible_id, updated_at"
)


class PostgresProjects:
    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def list_projects(self) -> list[ProjectRecord]:
        rows = self._conn.execute(f"SELECT {_COLUMNS} FROM projects ORDER BY code").fetchall()
        return [ProjectRecord(*row) for row in rows]

    def find(self, code: str) -> ProjectRecord | None:
        row = self._conn.execute(
            f"SELECT {_COLUMNS} FROM projects WHERE code = %s", (code,)
        ).fetchone()
        return None if row is None else ProjectRecord(*row)
