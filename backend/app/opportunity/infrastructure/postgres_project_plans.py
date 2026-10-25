"""Postgres adapter for the confirmed project plans: uses the business transaction's connection."""

from __future__ import annotations

from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from backend.app.opportunity.domain.plan import ProjectType, Scale
from backend.app.opportunity.domain.project_plan import (
    ConfirmedPlan,
    NewProjectPlan,
    StartableProject,
)

_COLUMNS = "p.code, pl.project_type, pl.scale, pl.weeks, pl.confirmed_by, pl.confirmed_at"


class PostgresProjectPlans:
    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def get_project(self, code: str, *, lock: bool = True) -> StartableProject | None:
        row = self._conn.execute(
            "SELECT p.id::text, p.study_id::text, p.code, p.current_phase, o.project_type, "
            "o.client, o.location FROM projects p "
            "JOIN opportunities o ON o.project_id = p.id AND o.study_id = p.study_id "
            "WHERE p.code = %s" + (" FOR UPDATE OF p" if lock else ""),
            (code,),
        ).fetchone()
        if row is None:
            return None
        return StartableProject(*row[:4], ProjectType(row[4]), row[5], row[6])

    def get(self, project_id: str) -> ConfirmedPlan | None:
        row = self._conn.execute(
            f"SELECT {_COLUMNS} FROM project_plans pl JOIN projects p ON p.id = pl.project_id "
            "WHERE pl.project_id = %s::uuid",
            (project_id,),
        ).fetchone()
        return None if row is None else _confirmed(row)

    def add(self, new: NewProjectPlan) -> ConfirmedPlan:
        self._conn.execute(
            "INSERT INTO project_plans (study_id, project_id, project_type, scale, weeks, "
            "confirmed_by) VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s)",
            (
                new.study_id,
                new.project_id,
                new.project_type.value,
                new.scale.value,
                list(new.weeks),
                new.confirmed_by,
            ),
        )
        confirmed = self.get(new.project_id)
        assert confirmed is not None  # just inserted in this transaction
        return confirmed

    def save_exit_content(self, project_id: str, content: dict[str, Any]) -> None:
        self._conn.execute(
            "INSERT INTO exit_deliverables (study_id, project_id, phase, content, complete, "
            "approved) SELECT study_id, id, 0, %s, true, true FROM projects WHERE id = %s::uuid "
            "ON CONFLICT (project_id, phase) DO UPDATE SET content = EXCLUDED.content, "
            "complete = true, approved = true, updated_at = now()",
            (Jsonb(content), project_id),
        )


def _confirmed(row) -> ConfirmedPlan:
    code, project_type, scale, weeks, confirmed_by, confirmed_at = row
    return ConfirmedPlan(
        project_code=code,
        project_type=ProjectType(project_type),
        scale=Scale(scale),
        weeks=tuple(weeks),
        confirmed_by=confirmed_by,
        confirmed_at=confirmed_at,
    )
