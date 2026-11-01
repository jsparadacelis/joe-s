"""Functions the person holds in every project, in one read (RLS limits it to the study)."""

from __future__ import annotations

from collections import defaultdict

import psycopg

from backend.app.access.domain.project_roles import ProjectRole
from backend.app.study.domain.context import RequestContext


class PostgresRoleDirectory:
    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def roles_by_project(
        self, context: RequestContext, project_ids: list[str]
    ) -> dict[str, frozenset[ProjectRole]]:
        rows = self._conn.execute(
            "SELECT pm.project_id::text, pm.role FROM project_members pm "
            "JOIN study_members sm ON sm.study_id = pm.study_id AND sm.id = pm.member_id "
            "WHERE sm.user_id = %s AND sm.status = 'active'",
            (context.user_id,),
        ).fetchall()
        roles: dict[str, set[ProjectRole]] = defaultdict(set)
        for project_id, role in rows:
            roles[project_id].add(ProjectRole(role))
        return {project_id: frozenset(found) for project_id, found in roles.items()}
