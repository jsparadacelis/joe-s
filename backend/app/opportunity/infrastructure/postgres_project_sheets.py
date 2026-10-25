"""Postgres adapter for the project sheet reads: uses the business transaction's connection."""

from __future__ import annotations

from typing import Any

import psycopg

from backend.app.opportunity.domain.plan import ProjectType
from backend.app.opportunity.domain.project_sheet import SheetProject


class PostgresProjectSheets:
    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def get_project(self, code: str) -> SheetProject | None:
        row = self._conn.execute(
            "SELECT p.id::text, p.code, p.current_phase, p.name, o.client, o.location, "
            "o.project_type, p.traffic_light FROM projects p "
            "JOIN opportunities o ON o.project_id = p.id AND o.study_id = p.study_id "
            "WHERE p.code = %s",
            (code,),
        ).fetchone()
        if row is None:
            return None
        return SheetProject(*row[:6], ProjectType(row[6]), row[7])

    def get_content(self, project_id: str) -> dict[str, Any] | None:
        row = self._conn.execute(
            "SELECT content FROM exit_deliverables WHERE project_id = %s::uuid AND phase = 1",
            (project_id,),
        ).fetchone()
        return None if row is None else row[0]
