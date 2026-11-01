"""Postgres adapter of the technical data: uses the request transaction's connection (RLS)."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime

import psycopg

from backend.app.technical_data.domain.catalog import Source
from backend.app.technical_data.domain.datum import TechnicalDatum
from backend.app.technical_data.domain.ports import QueryRecord
from backend.app.technical_data.domain.technical_data import TechnicalData


class PostgresTechnicalData:
    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def load(self, project_id: str) -> TechnicalData:
        rows = self._conn.execute(
            "SELECT field_id, value, source, original, verified FROM technical_data "
            "WHERE project_id = %s::uuid",
            (project_id,),
        ).fetchall()
        return TechnicalData.from_rows(
            TechnicalDatum(
                field_id=field_id,
                value=value,
                source=Source(source),
                original=original,
                verified=verified,
            )
            for field_id, value, source, original, verified in rows
        )

    def save(self, project_id: str, data: Iterable[TechnicalDatum]) -> None:
        for datum in data:
            self._conn.execute(
                "INSERT INTO technical_data "
                "(study_id, project_id, field_id, value, source, original, verified) "
                "VALUES (app_study_id()::uuid, %s::uuid, %s, %s, %s, %s, %s) "
                "ON CONFLICT (project_id, field_id) DO UPDATE SET value = EXCLUDED.value, "
                "source = EXCLUDED.source, original = EXCLUDED.original, "
                "verified = EXCLUDED.verified, updated_at = now()",
                (
                    project_id,
                    datum.field_id,
                    datum.value,
                    datum.source.value,
                    datum.original,
                    datum.verified,
                ),
            )

    def last_query(self, project_id: str) -> QueryRecord | None:
        row = self._conn.execute(
            "SELECT cadastral_reference, queried_at FROM technical_data_queries "
            "WHERE project_id = %s::uuid",
            (project_id,),
        ).fetchone()
        return None if row is None else QueryRecord(cadastral_reference=row[0], queried_at=row[1])

    def record_query(self, project_id: str, cadastral_reference: str, queried_at: datetime) -> None:
        self._conn.execute(
            "INSERT INTO technical_data_queries "
            "(study_id, project_id, cadastral_reference, queried_at) "
            "VALUES (app_study_id()::uuid, %s::uuid, %s, %s) "
            "ON CONFLICT (project_id) DO UPDATE SET "
            "cadastral_reference = EXCLUDED.cadastral_reference, queried_at = EXCLUDED.queried_at",
            (project_id, cadastral_reference, queried_at),
        )
