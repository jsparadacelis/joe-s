"""`AUTH_MODE=dev` only: the functions come from the fictitious user's studio role and
qualifications in every project, as `DevProjectRoles` does for one project."""

from __future__ import annotations

from backend.app.access.domain.project_roles import ProjectRole
from backend.app.access.infrastructure.dev_project_roles import DevProjectRoles
from backend.app.study.domain.context import RequestContext


class DevRoleDirectory:
    def roles_by_project(
        self, context: RequestContext, project_ids: list[str]
    ) -> dict[str, frozenset[ProjectRole]]:
        roles = DevProjectRoles(context)
        return {
            project_id: roles.roles_of(project_id, context.user_id) for project_id in project_ids
        }
