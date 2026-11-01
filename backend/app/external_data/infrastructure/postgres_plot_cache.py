"""Postgres cache of plot outlines: uses the request transaction's connection (RLS)."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta, timezone

import psycopg
from psycopg.types.json import Jsonb

from backend.app.external_data.domain.plot import Plot


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PostgresPlotCache:
    def __init__(self, conn: psycopg.Connection, clock: Callable[[], datetime] = _utc_now) -> None:
        self._conn = conn
        self._clock = clock

    def get(self, plot_reference: str, max_age: timedelta) -> Plot | None:
        row = self._conn.execute(
            "SELECT payload FROM plot_cache "
            "WHERE study_id = app_study_id()::uuid AND reference = %s AND fetched_at >= %s",
            (plot_reference, self._clock() - max_age),
        ).fetchone()
        return None if row is None else Plot.from_dict(row[0])

    def put(self, plot: Plot, fetched_at: datetime) -> None:
        self._conn.execute(
            "INSERT INTO plot_cache (study_id, reference, payload, fetched_at) "
            "VALUES (app_study_id()::uuid, %s, %s, %s) "
            "ON CONFLICT (study_id, reference) "
            "DO UPDATE SET payload = EXCLUDED.payload, fetched_at = EXCLUDED.fetched_at",
            (plot.reference, Jsonb(plot.to_dict()), fetched_at),
        )
