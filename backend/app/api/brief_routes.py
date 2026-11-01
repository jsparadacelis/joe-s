"""Brief routes (RGB-32): the manual brief of the Briefing phase and its promotion.

Reading is open to any member of the study; editing and promoting need the project director of
that project (decided by the central policy, in the use case) and phase 2. No AI route exists.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.app.api.dependencies import (
    BriefUnitOfWork,
    PromoteBriefUnitOfWork,
    UpdateBriefUnitOfWork,
    brief_unit_of_work,
    promote_brief_unit_of_work,
    request_context,
    update_brief_unit_of_work,
)
from backend.app.briefing.domain.brief import ProjectBrief
from backend.app.briefing.domain.errors import (
    BriefFieldError,
    BriefNotEditable,
    BriefNotFound,
    ProjectNotFound,
    PromotionRejected,
)
from backend.app.lifecycle.domain.errors import NoAuthority
from backend.app.study.domain.context import RequestContext

router = APIRouter(prefix="/api/projects/{code}/brief", tags=["brief"])

Context = Annotated[RequestContext, Depends(request_context)]
ReadUnit = Annotated[BriefUnitOfWork, Depends(brief_unit_of_work)]
UpdateUnit = Annotated[UpdateBriefUnitOfWork, Depends(update_brief_unit_of_work)]
PromoteUnit = Annotated[PromoteBriefUnitOfWork, Depends(promote_brief_unit_of_work)]

_STATUS = {NoAuthority: 403, BriefNotEditable: 409}


# Typed as Any on purpose: the domain validates the fields, so every bad value answers with its
# own error code and gets audited.
class BriefUpdateInput(BaseModel):
    fields: Any = None


def _brief_json(brief: ProjectBrief) -> dict[str, Any]:
    found = brief.completeness
    return {
        "code": brief.code,
        "phase": brief.phase,
        "frozen_version": brief.frozen_version,
        "fields": brief.fields,
        "completeness": {
            "missing": found.missing,
            "technical_data_obtained": found.technical_data_obtained,
            "technical_data_queried": found.technical_data_queried,
            "client_approval_recorded": found.client_approval_recorded,
            "complete": found.complete,
        },
        "technical_data": brief.technical_data,
        "permissions": {
            "can_edit": brief.permissions.can_edit,
            "can_promote": brief.permissions.can_promote,
        },
    }


def _not_found(error: Exception) -> HTTPException:
    return HTTPException(404, detail={"code": error.code, "message": str(error)})  # type: ignore[attr-defined]


def _detail(error: Any) -> dict[str, Any]:
    detail: dict[str, Any] = {"code": error.code, "message": error.message}
    if isinstance(error, BriefFieldError):
        detail["field"] = error.field
    elif hasattr(error, "details"):
        detail.update(error.details())
    return detail


@router.get("")
def get_brief(code: str, context: Context, open_unit: ReadUnit) -> dict:
    try:
        with open_unit(context) as reader:
            brief = reader.read(context, code)
    except (ProjectNotFound, BriefNotFound) as error:
        raise _not_found(error) from error
    return _brief_json(brief)


@router.put("")
def update_brief(
    code: str, body: BriefUpdateInput, context: Context, open_unit: UpdateUnit
) -> dict:
    try:
        with open_unit(context) as writer:
            result = writer.execute(context, code, body.fields)
    except ProjectNotFound as error:
        raise _not_found(error) from error
    # The transaction has already committed: the rejection is audited before responding.
    if result.error is not None:
        error = result.error
        raise HTTPException(_STATUS.get(type(error), 422), detail=_detail(error))
    return _brief_json(result.brief)


@router.post("/promote")
def promote_brief(code: str, context: Context, open_unit: PromoteUnit) -> dict:
    try:
        with open_unit(context) as promoter:
            result = promoter.execute(context, code)
    except ProjectNotFound as error:
        raise _not_found(error) from error
    except PromotionRejected as rejected:
        error = rejected.error
        raise HTTPException(_STATUS.get(type(error), 422), detail=_detail(error)) from rejected
    # The transaction has already committed: the rejection is audited before responding.
    if result.error is not None:
        error = result.error
        raise HTTPException(_STATUS.get(type(error), 422), detail=_detail(error))
    transition = result.transition
    return {
        "code": code,
        "action": transition.action,
        "previous_phase": transition.previous_phase,
        "current_phase": transition.current_phase,
        "frozen_version": transition.frozen_version,
        "brief": _brief_json(result.brief),
    }
