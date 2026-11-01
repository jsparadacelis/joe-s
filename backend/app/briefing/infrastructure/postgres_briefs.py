"""Postgres adapter of the brief: uses the business transaction's connection (RLS applies).

The draft lives in the phase 2 exit deliverable under the `brief` key; no table of its own."""

from __future__ import annotations

from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from backend.app.briefing.domain.brief import BRIEF_KEY, BRIEF_PHASE
from backend.app.briefing.domain.ports import BriefProject


class PostgresBriefs:
    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def get_project(self, code: str, *, lock: bool = False) -> BriefProject | None:
        row = self._conn.execute(
            "SELECT id::text, code, current_phase FROM projects WHERE code = %s"
            + (" FOR UPDATE" if lock else ""),
            (code,),
        ).fetchone()
        return None if row is None else BriefProject(*row)

    def get_brief(self, project_id: str) -> dict[str, Any]:
        row = self._conn.execute(
            "SELECT content -> %s FROM exit_deliverables WHERE project_id = %s::uuid AND phase = %s",
            (BRIEF_KEY, project_id, BRIEF_PHASE),
        ).fetchone()
        return {} if row is None or row[0] is None else row[0]

    def save_brief(self, project_id: str, brief: dict[str, Any]) -> None:
        self._conn.execute(
            "INSERT INTO exit_deliverables (study_id, project_id, phase, content) "
            "SELECT study_id, id, %s, jsonb_build_object(%s::text, %s::jsonb) FROM projects "
            "WHERE id = %s::uuid "
            "ON CONFLICT (project_id, phase) DO UPDATE SET "
            "content = exit_deliverables.content || EXCLUDED.content, updated_at = now()",
            (BRIEF_PHASE, BRIEF_KEY, Jsonb(brief), project_id),
        )

    def finalize(self, project_id: str, content: dict[str, Any]) -> None:
        self._conn.execute(
            "INSERT INTO exit_deliverables (study_id, project_id, phase, content, complete, "
            "approved) SELECT study_id, id, %s, %s, true, true FROM projects "
            "WHERE id = %s::uuid "
            "ON CONFLICT (project_id, phase) DO UPDATE SET content = EXCLUDED.content, "
            "complete = true, approved = true, updated_at = now()",
            (BRIEF_PHASE, Jsonb(content), project_id),
        )

    def get_frozen(self, project_id: str, phase: int) -> dict[str, Any] | None:
        row = self._conn.execute(
            "SELECT content FROM frozen_versions WHERE project_id = %s::uuid AND phase = %s "
            "ORDER BY version DESC LIMIT 1",
            (project_id, phase),
        ).fetchone()
        return None if row is None else row[0]
