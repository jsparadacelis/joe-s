"""`AUTH_MODE=dev` only: there is no team to read, so the functions in every project come from
the fictitious user's studio role and qualifications, as authority worked before project roles
existed. Never wired when `AUTH_MODE=supabase`."""

from __future__ import annotations

from backend.app.access.domain.project_roles import ProjectRole
from backend.app.study.domain.context import Qualification, RequestContext, Role

_BY_STUDY_ROLE = {
    Role.PROJECT_DIRECTOR: ProjectRole.PROJECT_DIRECTOR,
    Role.TECHNICAL_LEAD: ProjectRole.TECHNICAL_LEAD,
    Role.ARCHITECT: ProjectRole.ARCHITECT,
    Role.SITE_COLLABORATOR: ProjectRole.SITE_COLLABORATOR,
}
_BY_QUALIFICATION = {
    Qualification.LICENSED_SIGNATORY: ProjectRole.LICENSED_SIGNATORY,
    Qualification.SITE_MANAGEMENT: ProjectRole.SITE_MANAGEMENT,
    Qualification.SPONSOR: ProjectRole.SPONSOR,
}


class DevProjectRoles:
    def __init__(self, context: RequestContext) -> None:
        roles = {_BY_QUALIFICATION[q] for q in context.qualifications}
        if context.role in _BY_STUDY_ROLE:
            roles.add(_BY_STUDY_ROLE[context.role])
        self._roles = frozenset(roles)

    def roles_of(self, project_id: str, user_id: str) -> frozenset[ProjectRole]:
        return self._roles
