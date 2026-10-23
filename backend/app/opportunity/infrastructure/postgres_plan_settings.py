"""Postgres adapter for the plan settings: uses the business transaction's connection."""

from __future__ import annotations

from decimal import Decimal

import psycopg

from backend.app.opportunity.domain.plan import ProjectType, Scale


class PostgresPlanSettings:
    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def get_templates(self) -> dict[ProjectType, tuple[int, ...]]:
        rows = self._conn.execute("SELECT project_type, weeks FROM plan_templates").fetchall()
        return {ProjectType(project_type): tuple(weeks) for project_type, weeks in rows}

    def get_scale_factors(self) -> dict[Scale, Decimal]:
        rows = self._conn.execute("SELECT scale, factor FROM scale_factors").fetchall()
        return {Scale(scale): factor for scale, factor in rows}

    def save_template(self, project_type: ProjectType, weeks: tuple[int, ...]) -> None:
        self._conn.execute(
            "INSERT INTO plan_templates (study_id, project_type, weeks) "
            "VALUES (app_study_id()::uuid, %s, %s) "
            "ON CONFLICT (study_id, project_type) "
            "DO UPDATE SET weeks = EXCLUDED.weeks, updated_at = now()",
            (project_type.value, list(weeks)),
        )

    def save_scale_factor(self, scale: Scale, factor: Decimal) -> None:
        self._conn.execute(
            "INSERT INTO scale_factors (study_id, scale, factor) "
            "VALUES (app_study_id()::uuid, %s, %s) "
            "ON CONFLICT (study_id, scale) "
            "DO UPDATE SET factor = EXCLUDED.factor, updated_at = now()",
            (scale.value, factor),
        )
