"""What the project sheet says about a project (typology, location), for the alerts. Read only;
row level security applies, so another study's project reads as blank."""

from __future__ import annotations

import psycopg

from backend.app.technical_data.domain.alerts import ProjectFacts


class PostgresProjectFacts:
    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def facts_of(self, project_id: str) -> ProjectFacts:
        row = self._conn.execute(
            "SELECT project_type, location FROM opportunities WHERE project_id = %s::uuid",
            (project_id,),
        ).fetchone()
        return ProjectFacts(None, None) if row is None else ProjectFacts(row[0], row[1])
