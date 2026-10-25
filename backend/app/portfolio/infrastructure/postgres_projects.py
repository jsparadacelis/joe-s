"""Postgres adapter for the portfolio reads: RLS limits every query to the study."""

from __future__ import annotations

import psycopg

from backend.app.portfolio.domain.project import ProjectRecord

# The partial unique index guarantees at most one open pause per project: no duplicated rows.
_SELECT = (
    "SELECT p.code, p.name, p.current_phase, p.paused, p.traffic_light, p.next_milestone, "
    "p.responsible_id, p.updated_at, o.reason, o.expected_resumption, op.project_type "
    "FROM projects p LEFT JOIN pauses o ON o.project_id = p.id AND o.resumed_on IS NULL "
    "LEFT JOIN opportunities op ON op.project_id = p.id"
)


class PostgresProjects:
    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def list_projects(self) -> list[ProjectRecord]:
        rows = self._conn.execute(f"{_SELECT} ORDER BY p.code").fetchall()
        return [ProjectRecord(*row) for row in rows]

    def find(self, code: str) -> ProjectRecord | None:
        row = self._conn.execute(f"{_SELECT} WHERE p.code = %s", (code,)).fetchone()
        return None if row is None else ProjectRecord(*row)
