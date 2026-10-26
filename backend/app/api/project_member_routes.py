"""Project member routes: who holds which function in a project."""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict

from backend.app.access.application.manage_project_members import AssignmentResult
from backend.app.access.domain.assignment import Assignment
from backend.app.access.domain.errors import (
    AssignmentAlreadyExists,
    AssignmentNotFound,
    MemberNotActive,
    MemberNotFound,
    NoAuthority,
    ProjectNotFound,
)
from backend.app.access.domain.project_roles import ProjectRole
from backend.app.api.dependencies import (
    ProjectMembersUnitOfWork,
    project_members_unit_of_work,
    request_context,
)
from backend.app.study.domain.context import RequestContext

router = APIRouter(prefix="/api/projects/{code}/members", tags=["project-members"])

Context = Annotated[RequestContext, Depends(request_context)]
Unit = Annotated[ProjectMembersUnitOfWork, Depends(project_members_unit_of_work)]

_HTTP_STATUS = {
    NoAuthority: 403,
    ProjectNotFound: 404,
    MemberNotFound: 404,
    AssignmentNotFound: 404,
    MemberNotActive: 409,
    AssignmentAlreadyExists: 409,
}


class AssignmentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    member_id: UUID
    role: ProjectRole


def _assignment_json(assignment: Assignment) -> dict[str, Any]:
    return {"id": assignment.id, "member_id": assignment.member_id, "role": assignment.role.value}


def _answer(result: AssignmentResult) -> AssignmentResult:
    # The transaction has already committed: a refusal is audited before responding.
    if result.error is not None:
        error = result.error
        status = next((s for kind, s in _HTTP_STATUS.items() if isinstance(error, kind)), 422)
        raise HTTPException(status, detail={"code": error.code, "message": error.message})
    return result


@router.post("", status_code=201)
def assign(code: str, body: AssignmentInput, context: Context, open_unit: Unit) -> dict:
    with open_unit(context) as service:
        result = service.assign(context, code, str(body.member_id), body.role)
    return _assignment_json(_answer(result).assignment)


@router.delete("/{assignment_id}")
def unassign(code: str, assignment_id: UUID, context: Context, open_unit: Unit) -> dict:
    with open_unit(context) as service:
        result = service.unassign(context, code, str(assignment_id))
    return _assignment_json(_answer(result).assignment)


@router.get("")
def list_team(code: str, context: Context, open_unit: Unit) -> dict:
    with open_unit(context) as service:
        result = service.list_team(context, code)
    return {"members": [_assignment_json(a) for a in _answer(result).assignments]}
