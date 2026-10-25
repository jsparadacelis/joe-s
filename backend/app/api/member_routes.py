"""Member routes: invite, list and revoke the people of the study."""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict

from backend.app.api.dependencies import (
    MembersUnitOfWork,
    members_unit_of_work,
    request_context,
    study_http_error,
)
from backend.app.study.application.manage_members import MemberResult
from backend.app.study.domain.context import Qualification, RequestContext, Role
from backend.app.study.domain.errors import (
    InvalidEmail,
    LastPartner,
    MemberAlreadyExists,
    MemberNotFound,
    NoAuthority,
)
from backend.app.study.domain.members import Member

router = APIRouter(prefix="/api/members", tags=["members"])

Context = Annotated[RequestContext, Depends(request_context)]
Unit = Annotated[MembersUnitOfWork, Depends(members_unit_of_work)]

_HTTP_STATUS = {
    NoAuthority: 403,
    LastPartner: 409,
    MemberAlreadyExists: 409,
    MemberNotFound: 404,
    InvalidEmail: 422,
}


def _status_of(error: Exception) -> int:
    return next((s for kind, s in _HTTP_STATUS.items() if isinstance(error, kind)), 422)


class InvitationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str
    role: Role
    qualifications: list[Qualification] = []


def _member_json(member: Member) -> dict[str, Any]:
    return {
        "id": member.id,
        "email": member.email,
        "role": member.role.value,
        "qualifications": sorted(q.value for q in member.qualifications),
        "status": member.status.value,
    }


def _answer(result: MemberResult) -> dict[str, Any]:
    # The transaction has already committed: a refusal for lack of permission is audited
    # before responding.
    if result.error is not None:
        raise study_http_error(result.error, _status_of(result.error))
    return _member_json(result.member)


@router.post("/invitations", status_code=201)
def invite(body: InvitationInput, context: Context, open_unit: Unit) -> dict:
    with open_unit(context) as service:
        result = service.invite(context, body.email, body.role, frozenset(body.qualifications))
    return _answer(result)


@router.get("")
def list_members(context: Context, open_unit: Unit) -> dict:
    with open_unit(context) as service:
        members = service.list_members(context)
    return {"members": [_member_json(member) for member in members]}


@router.post("/{member_id}/revoke")
def revoke(member_id: UUID, context: Context, open_unit: Unit) -> dict:
    with open_unit(context) as service:
        result = service.revoke(context, str(member_id))
    return _answer(result)
