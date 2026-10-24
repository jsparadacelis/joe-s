"""Postgres adapter for pauses: uses the business transaction's connection (RLS applies)."""

from __future__ import annotations

from datetime import date

import psycopg

from backend.app.timing.domain.pause import NewPause, PausableProject, Pause
from backend.app.timing.domain.time_tracking import PauseReason

_COLUMNS = (
    "id::text, project_id::text, phase, reason, started_on, expected_resumption, opened_by, "
    "resumed_on, closed_by"
)


def _pause(row) -> Pause:
    id_, project_id, phase, reason, started_on, expected, opened_by, resumed_on, closed_by = row
    return Pause(
        id=id_,
        project_id=project_id,
        phase=phase,
        reason=PauseReason(reason),
        started_on=started_on,
        expected_resumption=expected,
        opened_by=opened_by,
        resumed_on=resumed_on,
        closed_by=closed_by,
    )


class PostgresPauses:
    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def get_project(self, code: str, *, lock: bool = True) -> PausableProject | None:
        row = self._conn.execute(
            "SELECT id::text, study_id::text, code, current_phase, paused FROM projects "
            "WHERE code = %s" + (" FOR UPDATE" if lock else ""),
            (code,),
        ).fetchone()
        return None if row is None else PausableProject(*row)

    def get_open_pause(self, project_id: str) -> Pause | None:
        row = self._conn.execute(
            f"SELECT {_COLUMNS} FROM pauses WHERE project_id = %s::uuid AND resumed_on IS NULL",
            (project_id,),
        ).fetchone()
        return None if row is None else _pause(row)

    def add(self, new: NewPause) -> Pause:
        row = self._conn.execute(
            "INSERT INTO pauses (study_id, project_id, phase, reason, started_on, "
            "expected_resumption, opened_by) VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s) "
            f"RETURNING {_COLUMNS}",
            (
                new.study_id,
                new.project_id,
                new.phase,
                new.reason.value,
                new.started_on,
                new.expected_resumption,
                new.opened_by,
            ),
        ).fetchone()
        return _pause(row)

    def close(self, pause_id: str, resumed_on: date, closed_by: str) -> Pause:
        row = self._conn.execute(
            "UPDATE pauses SET resumed_on = %s, closed_by = %s WHERE id = %s::uuid "
            f"RETURNING {_COLUMNS}",
            (resumed_on, closed_by, pause_id),
        ).fetchone()
        return _pause(row)

    def set_paused(self, project_id: str, paused: bool) -> None:
        self._conn.execute(
            "UPDATE projects SET paused = %s, updated_at = now() WHERE id = %s::uuid",
            (paused, project_id),
        )

    def list_pauses(self, project_id: str) -> list[Pause]:
        rows = self._conn.execute(
            f"SELECT {_COLUMNS} FROM pauses WHERE project_id = %s::uuid "
            "ORDER BY started_on DESC, created_at DESC, id",
            (project_id,),
        ).fetchall()
        return [_pause(row) for row in rows]
