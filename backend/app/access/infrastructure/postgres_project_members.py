"""Postgres adapter of the access context."""

from __future__ import annotations

import psycopg

from backend.app.access.domain.assignment import Assignment
from backend.app.access.domain.errors import AssignmentAlreadyExists
from backend.app.access.domain.project_roles import ProjectRole

_COLUMNS = "id::text, study_id::text, project_id::text, member_id::text, role"


def _assignment(row) -> Assignment:
    assignment_id, study_id, project_id, member_id, role = row
    return Assignment(
        id=assignment_id,
        study_id=study_id,
        project_id=project_id,
        member_id=member_id,
        role=ProjectRole(role),
    )


class PostgresProjectMembers:
    """Assignments of the study set on the connection; row level security does the filtering."""

    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def add(
        self,
        *,
        study_id: str,
        project_id: str,
        member_id: str,
        role: ProjectRole,
        assigned_by: str,
    ) -> Assignment:
        try:
            with self._conn.transaction():
                row = self._conn.execute(
                    "INSERT INTO project_members (study_id, project_id, member_id, role, "
                    "assigned_by) VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s) "
                    f"RETURNING {_COLUMNS}",
                    (study_id, project_id, member_id, role.value, assigned_by),
                ).fetchone()
        except psycopg.errors.UniqueViolation as error:
            raise AssignmentAlreadyExists() from error
        return _assignment(row)

    def remove(self, project_id: str, assignment_id: str) -> Assignment | None:
        row = self._conn.execute(
            f"DELETE FROM project_members WHERE project_id = %s::uuid AND id = %s::uuid "
            f"RETURNING {_COLUMNS}",
            (project_id, assignment_id),
        ).fetchone()
        return None if row is None else _assignment(row)

    def list_for_project(self, project_id: str) -> list[Assignment]:
        rows = self._conn.execute(
            f"SELECT {_COLUMNS} FROM project_members WHERE project_id = %s::uuid "
            "ORDER BY assigned_at, id",
            (project_id,),
        ).fetchall()
        return [_assignment(row) for row in rows]

    def roles_of(self, project_id: str, user_id: str) -> frozenset[ProjectRole]:
        rows = self._conn.execute(
            "SELECT pm.role FROM project_members pm "
            "JOIN study_members sm ON sm.study_id = pm.study_id AND sm.id = pm.member_id "
            "WHERE pm.project_id = %s::uuid AND sm.user_id = %s AND sm.status = 'active'",
            (project_id, user_id),
        ).fetchall()
        return frozenset(ProjectRole(row[0]) for row in rows)
