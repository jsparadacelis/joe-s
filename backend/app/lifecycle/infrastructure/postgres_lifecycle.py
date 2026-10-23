"""Lifecycle Postgres adapter: uses the business transaction's connection."""

from __future__ import annotations

import psycopg
from psycopg.types.json import Jsonb

from backend.app.lifecycle.domain.deliverable import ExitDeliverable
from backend.app.lifecycle.domain.frozen_version import FrozenVersion
from backend.app.lifecycle.domain.project import Project, TrafficLight
from backend.app.lifecycle.domain.promotion import Promotion


class PostgresLifecycle:
    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def get_project(self, code: str) -> Project | None:
        row = self._conn.execute(
            "SELECT id::text, study_id::text, code, name, current_phase, active, paused, "
            "responsible_id, next_milestone, traffic_light FROM projects "
            "WHERE code = %s FOR UPDATE",
            (code,),
        ).fetchone()
        if row is None:
            return None
        id_, study_id, code, name, phase, active, paused, responsible, milestone, traffic_light = (
            row
        )
        return Project(
            id=id_,
            study_id=study_id,
            code=code,
            name=name,
            current_phase=phase,
            active=active,
            paused=paused,
            responsible_id=responsible,
            next_milestone=milestone,
            traffic_light=TrafficLight(traffic_light) if traffic_light else None,
        )

    def get_deliverable(self, project_id: str, phase: int) -> ExitDeliverable | None:
        row = self._conn.execute(
            "SELECT content, complete, approved FROM exit_deliverables "
            "WHERE project_id = %s::uuid AND phase = %s",
            (project_id, phase),
        ).fetchone()
        return None if row is None else ExitDeliverable(phase, row[0], row[1], row[2])

    def next_version(self, project_id: str, phase: int) -> int:
        return self._conn.execute(
            "SELECT coalesce(max(version), 0) + 1 FROM frozen_versions "
            "WHERE project_id = %s::uuid AND phase = %s",
            (project_id, phase),
        ).fetchone()[0]

    def freeze(self, version: FrozenVersion) -> None:
        self._conn.execute(
            "INSERT INTO frozen_versions (study_id, project_id, phase, version, content, "
            "frozen_by) VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s)",
            (
                version.study_id,
                version.project_id,
                version.phase,
                version.version,
                Jsonb(version.content),
                version.frozen_by,
            ),
        )

    def record_promotion(self, promotion: Promotion) -> None:
        self._conn.execute(
            "INSERT INTO promotions (study_id, project_id, action, from_phase, to_phase, "
            "user_id, outcome, reason) VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s)",
            (
                promotion.study_id,
                promotion.project_id,
                promotion.action.value,
                promotion.from_phase,
                promotion.to_phase,
                promotion.user_id,
                promotion.outcome.value,
                promotion.reason,
            ),
        )

    def change_phase(self, project_id: str, phase: int) -> None:
        self._conn.execute(
            "UPDATE projects SET current_phase = %s, updated_at = now() WHERE id = %s::uuid",
            (phase, project_id),
        )

    def open_deliverable(self, project_id: str, phase: int) -> None:
        self._conn.execute(
            "INSERT INTO exit_deliverables (study_id, project_id, phase) "
            "SELECT study_id, id, %s FROM projects WHERE id = %s::uuid "
            "ON CONFLICT (project_id, phase) DO NOTHING",
            (phase, project_id),
        )
