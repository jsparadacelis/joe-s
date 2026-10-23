"""Promotion routes: promote, hold and do-not-pursue a project."""

from __future__ import annotations

from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.app.api.dependencies import UnitOfWork, request_context, unit_of_work
from backend.app.lifecycle.application.promotion_service import (
    PromotionService,
    Transition,
)
from backend.app.lifecycle.domain.errors import (
    ActionNotAllowed,
    IncompleteDeliverable,
    NoAuthority,
    NoNextPhase,
    ProjectNotFound,
    ReasonRequired,
)
from backend.app.study.domain.context import RequestContext

router = APIRouter(prefix="/api/projects", tags=["promotion"])

_HTTP_STATUS = {
    NoAuthority: 403,
    IncompleteDeliverable: 422,
    ReasonRequired: 422,
    NoNextPhase: 409,
    ActionNotAllowed: 409,
}

Context = Annotated[RequestContext, Depends(request_context)]
Unit = Annotated[UnitOfWork, Depends(unit_of_work)]


class ReasonInput(BaseModel):
    reason: str


def _execute(
    open_unit: UnitOfWork,
    context: RequestContext,
    code: str,
    action: Callable[[PromotionService], Transition],
) -> dict:
    try:
        with open_unit(context) as service:
            transition = action(service)
    except ProjectNotFound as error:
        raise HTTPException(404, detail={"code": error.code, "message": str(error)}) from error
    # The transaction has already committed: the rejection is audited before responding.
    if not transition.ok:
        error = transition.error
        raise HTTPException(
            _HTTP_STATUS.get(type(error), 409),
            detail={"code": error.code, "message": error.message, **error.details()},
        )
    return {
        "code": code,
        "action": transition.action,
        "previous_phase": transition.previous_phase,
        "current_phase": transition.current_phase,
        "frozen_version": transition.frozen_version,
    }


@router.post("/{code}/promote")
def promote(code: str, context: Context, open_unit: Unit) -> dict:
    return _execute(open_unit, context, code, lambda s: s.promote(context, code))


@router.post("/{code}/hold")
def hold(code: str, payload: ReasonInput, context: Context, open_unit: Unit) -> dict:
    return _execute(open_unit, context, code, lambda s: s.hold(context, code, payload.reason))


@router.post("/{code}/do-not-pursue")
def do_not_pursue(code: str, payload: ReasonInput, context: Context, open_unit: Unit) -> dict:
    return _execute(
        open_unit, context, code, lambda s: s.do_not_pursue(context, code, payload.reason)
    )
