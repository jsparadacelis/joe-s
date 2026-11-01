"""Postgres cache of reliefs: uses the request transaction's connection (RLS)."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta, timezone

import psycopg
from psycopg.types.json import Jsonb

from backend.app.external_data.domain.relief import Relief, ReliefOptions


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PostgresReliefCache:
    def __init__(self, conn: psycopg.Connection, clock: Callable[[], datetime] = _utc_now) -> None:
        self._conn = conn
        self._clock = clock

    def get(self, plot_reference: str, options: ReliefOptions, max_age: timedelta) -> Relief | None:
        row = self._conn.execute(
            "SELECT payload FROM relief_cache "
            "WHERE study_id = app_study_id()::uuid AND reference = %s AND window_key = %s "
            "AND fetched_at >= %s",
            (plot_reference, options.cache_key, self._clock() - max_age),
        ).fetchone()
        return None if row is None else Relief.from_dict(row[0])

    def put(self, relief: Relief, options: ReliefOptions, fetched_at: datetime) -> None:
        self._conn.execute(
            "INSERT INTO relief_cache (study_id, reference, window_key, payload, fetched_at) "
            "VALUES (app_study_id()::uuid, %s, %s, %s, %s) "
            "ON CONFLICT (study_id, reference, window_key) "
            "DO UPDATE SET payload = EXCLUDED.payload, fetched_at = EXCLUDED.fetched_at",
            (relief.reference, options.cache_key, Jsonb(relief.to_dict()), fetched_at),
        )
