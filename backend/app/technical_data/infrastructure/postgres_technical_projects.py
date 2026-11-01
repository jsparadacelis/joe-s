"""Finds a project of the current study by its code (row level security applies)."""

from __future__ import annotations

import psycopg

from backend.app.technical_data.domain.ports import TechnicalProject


class PostgresTechnicalProjects:
    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def find(self, code: str, *, lock: bool = False) -> TechnicalProject | None:
        row = self._conn.execute(
            "SELECT id::text, code, current_phase FROM projects WHERE code = %s"
            + (" FOR UPDATE" if lock else ""),
            (code,),
        ).fetchone()
        return None if row is None else TechnicalProject(id=row[0], code=row[1], phase=row[2])
