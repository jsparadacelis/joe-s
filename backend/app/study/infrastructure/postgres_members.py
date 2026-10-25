"""Postgres adapters of the study context."""

from __future__ import annotations

import psycopg

from backend.app.study.domain.context import Qualification, Role
from backend.app.study.domain.errors import MemberAlreadyExists
from backend.app.study.domain.members import Member, MemberStatus
from backend.app.study.domain.ports import Resolution

_COLUMNS = "id::text, study_id::text, email, role, qualifications, status, user_id"


def _member(row) -> Member:
    member_id, study_id, email, role, qualifications, status, user_id = row
    return Member(
        id=member_id,
        study_id=study_id,
        email=email,
        role=Role(role),
        qualifications=frozenset(Qualification(q) for q in qualifications),
        status=MemberStatus(status),
        user_id=user_id,
    )


class PostgresMemberResolver:
    """Runs before the study is known (see `identity_transaction`)."""

    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def resolve(self, email: str, subject: str) -> Resolution | None:
        row = self._conn.execute(
            "SELECT member_id::text, study_id::text, email, role, qualifications, status, "
            "user_id, activated FROM resolve_member(%s, %s)",
            (email, subject),
        ).fetchone()
        if row is None:
            return None
        # From here on this transaction belongs to that study, so the activation can be
        # audited in it (the audit table is protected by the same policy).
        self._conn.execute("SELECT set_config('app.study_id', %s, true)", (row[1],))
        return Resolution(member=_member(row[:7]), activated=row[7])


class PostgresMembers:
    """Members of the study set on the connection; row level security does the filtering."""

    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def add(
        self,
        *,
        study_id: str,
        email: str,
        role: Role,
        qualifications: frozenset[Qualification],
        invited_by: str,
    ) -> Member:
        try:
            with self._conn.transaction():
                row = self._conn.execute(
                    "INSERT INTO study_members (study_id, email, role, qualifications, "
                    "status, invited_by) VALUES (%s::uuid, %s, %s, %s, 'invited', %s) "
                    f"RETURNING {_COLUMNS}",
                    (
                        study_id,
                        email,
                        role.value,
                        sorted(q.value for q in qualifications),
                        invited_by,
                    ),
                ).fetchone()
        except psycopg.errors.UniqueViolation as error:
            raise MemberAlreadyExists() from error
        return _member(row)

    def find_by_email(self, email: str) -> Member | None:
        row = self._conn.execute(
            f"SELECT {_COLUMNS} FROM study_members WHERE lower(email) = lower(%s)", (email,)
        ).fetchone()
        return None if row is None else _member(row)

    def get(self, member_id: str) -> Member | None:
        row = self._conn.execute(
            f"SELECT {_COLUMNS} FROM study_members WHERE id = %s::uuid", (member_id,)
        ).fetchone()
        return None if row is None else _member(row)

    def list(self) -> list[Member]:
        rows = self._conn.execute(
            f"SELECT {_COLUMNS} FROM study_members ORDER BY invited_at, email"
        ).fetchall()
        return [_member(row) for row in rows]

    def revoke(self, member_id: str) -> Member | None:
        row = self._conn.execute(
            "UPDATE study_members SET status = 'revoked', revoked_at = now() "
            f"WHERE id = %s::uuid RETURNING {_COLUMNS}",
            (member_id,),
        ).fetchone()
        return None if row is None else _member(row)

    def lock_active_partners(self) -> list[Member]:
        # Fixed order so concurrent callers queue instead of deadlocking. After waiting, the
        # rows revoked meanwhile no longer match and drop out of the result.
        rows = self._conn.execute(
            f"SELECT {_COLUMNS} FROM study_members WHERE role = 'partner' AND status = 'active' "
            "ORDER BY id FOR UPDATE"
        ).fetchall()
        return [_member(row) for row in rows]
