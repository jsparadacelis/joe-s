"""Assign, remove and list the functions people hold in a project. Refusals are returned (not
raised) so the transaction commits and a refused attempt stays in the audit log."""

from __future__ import annotations

from dataclasses import dataclass

from backend.app.access.application.actors import person_actor
from backend.app.access.domain.actions import Action
from backend.app.access.domain.assignment import Assignment
from backend.app.access.domain.errors import (
    AccessError,
    AssignmentNotFound,
    MemberNotActive,
    MemberNotFound,
    MissingQualification,
    NoAuthority,
    ProjectNotFound,
    SigningFunctionRestricted,
)
from backend.app.access.domain.policy import can
from backend.app.access.domain.ports import ProjectDirectory, ProjectMembers, ProjectRef
from backend.app.access.domain.project_roles import SIGNING_FUNCTIONS, ProjectRole
from backend.app.access.domain.resource import ProjectResource
from backend.app.audit.application.record import audit
from backend.app.audit.domain.event import Outcome
from backend.app.audit.domain.ports import AuditLog
from backend.app.study.domain.context import Qualification, RequestContext, Role
from backend.app.study.domain.members import MemberStatus
from backend.app.study.domain.ports import Members

ENTITY = "project_member"
_MANAGEMENT = frozenset({Role.PARTNER, Role.DIRECTOR})
_QUALIFICATION_FOR = {
    ProjectRole.LICENSED_SIGNATORY: Qualification.LICENSED_SIGNATORY,
    ProjectRole.SITE_MANAGEMENT: Qualification.SITE_MANAGEMENT,
    ProjectRole.SPONSOR: Qualification.SPONSOR,
}


@dataclass(frozen=True)
class AssignmentResult:
    assignment: Assignment | None = None
    assignments: list[Assignment] | None = None
    error: AccessError | None = None


class ManageProjectMembers:
    def __init__(
        self,
        directory: ProjectDirectory,
        project_members: ProjectMembers,
        members: Members,
        audit_log: AuditLog,
    ) -> None:
        self._directory = directory
        self._project_members = project_members
        self._members = members
        self._audit_log = audit_log

    def assign(
        self, context: RequestContext, code: str, member_id: str, role: ProjectRole
    ) -> AssignmentResult:
        project = self._directory.find(code)
        if project is None:
            return AssignmentResult(error=ProjectNotFound())
        asked = {"member_id": member_id, "role": role.value}
        refusal = self._refusal(context, project, role)
        if refusal is not None:
            return self._reject(context, project, "assign", refusal, asked)
        member = self._members.get(member_id)
        if member is None:
            return AssignmentResult(error=MemberNotFound())
        if member.status is not MemberStatus.ACTIVE:
            return AssignmentResult(error=MemberNotActive())
        needed = _QUALIFICATION_FOR.get(role)
        if needed is not None and needed not in member.qualifications:
            return AssignmentResult(error=MissingQualification())
        try:
            assignment = self._project_members.add(
                study_id=context.study_id,
                project_id=project.id,
                member_id=member_id,
                role=role,
                assigned_by=context.user_id,
            )
        except AccessError as error:
            return AssignmentResult(error=error)
        audit(
            self._audit_log,
            context,
            entity=ENTITY,
            entity_id=assignment.id,
            action="assign",
            new_value={"project": project.code, **asked},
        )
        return AssignmentResult(assignment=assignment)

    def unassign(self, context: RequestContext, code: str, assignment_id: str) -> AssignmentResult:
        project = self._directory.find(code)
        if project is None:
            return AssignmentResult(error=ProjectNotFound())
        asked = {"assignment_id": assignment_id}
        refusal = self._refusal(context, project, None)
        if refusal is not None:
            return self._reject(context, project, "unassign", refusal, asked)
        team = self._project_members.list_for_project(project.id)
        current = next((a for a in team if a.id == assignment_id), None)
        if current is None:
            return AssignmentResult(error=AssignmentNotFound())
        if current.role in SIGNING_FUNCTIONS and context.role not in _MANAGEMENT:
            return self._reject(context, project, "unassign", SigningFunctionRestricted(), asked)
        removed = self._project_members.remove(project.id, assignment_id)
        if removed is None:
            return AssignmentResult(error=AssignmentNotFound())
        audit(
            self._audit_log,
            context,
            entity=ENTITY,
            entity_id=removed.id,
            action="unassign",
            old_value={
                "project": project.code,
                "member_id": removed.member_id,
                "role": removed.role.value,
            },
        )
        return AssignmentResult(assignment=removed)

    def list_team(self, context: RequestContext, code: str) -> AssignmentResult:
        project = self._directory.find(code)
        if project is None:
            return AssignmentResult(error=ProjectNotFound())
        return AssignmentResult(assignments=self._project_members.list_for_project(project.id))

    def _refusal(
        self, context: RequestContext, project: ProjectRef, role: ProjectRole | None
    ) -> AccessError | None:
        project_roles = self._project_members.roles_of(project.id, context.user_id)
        decision = can(
            person_actor(context, project_roles),
            Action.MANAGE_PROJECT_MEMBERS,
            ProjectResource(project_id=project.id, phase=project.phase),
        )
        if not decision.allowed:
            return NoAuthority()
        if role in SIGNING_FUNCTIONS and context.role not in _MANAGEMENT:
            return SigningFunctionRestricted()
        return None

    def _reject(
        self,
        context: RequestContext,
        project: ProjectRef,
        action: str,
        error: AccessError,
        asked: dict,
    ) -> AssignmentResult:
        audit(
            self._audit_log,
            context,
            entity=ENTITY,
            entity_id=project.id,
            action=action,
            new_value={"project": project.code, **asked, "error": error.code},
            outcome=Outcome.REJECTED,
        )
        return AssignmentResult(error=error)
