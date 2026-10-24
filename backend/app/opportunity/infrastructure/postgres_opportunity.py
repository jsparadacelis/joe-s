"""Postgres adapter for opportunities: uses the business transaction's connection."""

from __future__ import annotations

import psycopg

from backend.app.opportunity.domain.opportunity import Opportunity


class PostgresOpportunities:
    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def next_code(self, year: int) -> str:
        # Transaction-scoped lock per study and year: a concurrent creator waits for our commit,
        # then sees our project when it computes its own number.
        self._conn.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended("
            "'opportunity-code:' || app_study_id() || ':' || %s::text, 0))",
            (year,),
        )
        prefix = f"PRY-{year}-"
        (highest,) = self._conn.execute(
            "SELECT coalesce(max(substr(code, %s)::integer), 0) FROM projects "
            "WHERE study_id = app_study_id()::uuid AND code ~ %s",
            (len(prefix) + 1, f"^PRY-{year}-[0-9]{{1,9}}$"),
        ).fetchone()
        return f"{prefix}{highest + 1:03d}"

    def add(self, code: str, opportunity: Opportunity) -> None:
        (project_id,) = self._conn.execute(
            "INSERT INTO projects (study_id, code, name, current_phase, active, paused, "
            "responsible_id) VALUES (app_study_id()::uuid, %s, %s, 0, false, false, %s) "
            "RETURNING id",
            (code, opportunity.name, opportunity.owner),
        ).fetchone()
        self._conn.execute(
            "INSERT INTO opportunities (study_id, project_id, client, location, project_type, "
            "estimated_budget, deadline, source, decision_date) "
            "VALUES (app_study_id()::uuid, %s, %s, %s, %s, %s, %s, %s, %s)",
            (
                project_id,
                opportunity.client,
                opportunity.location,
                opportunity.project_type.value,
                opportunity.estimated_budget,
                opportunity.deadline,
                opportunity.source,
                opportunity.decision_date,
            ),
        )
