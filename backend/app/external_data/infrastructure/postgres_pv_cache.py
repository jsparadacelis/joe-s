"""Postgres cache of photovoltaic yields: uses the request transaction's connection (RLS)."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta, timezone

import psycopg
from psycopg.types.json import Jsonb

from backend.app.external_data.domain.pv import PvLocation, PvYield


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PostgresPvCache:
    def __init__(self, conn: psycopg.Connection, clock: Callable[[], datetime] = _utc_now) -> None:
        self._conn = conn
        self._clock = clock

    def get(self, location: PvLocation, max_age: timedelta) -> PvYield | None:
        row = self._conn.execute(
            "SELECT payload FROM pv_cache "
            "WHERE study_id = app_study_id()::uuid AND location = %s AND fetched_at >= %s",
            (location.key, self._clock() - max_age),
        ).fetchone()
        return None if row is None else PvYield.from_dict(location, row[0])

    def put(self, pv_yield: PvYield, fetched_at: datetime) -> None:
        self._conn.execute(
            "INSERT INTO pv_cache (study_id, location, payload, fetched_at) "
            "VALUES (app_study_id()::uuid, %s, %s, %s) "
            "ON CONFLICT (study_id, location) "
            "DO UPDATE SET payload = EXCLUDED.payload, fetched_at = EXCLUDED.fetched_at",
            (pv_yield.location.key, Jsonb(pv_yield.to_dict()), fetched_at),
        )
