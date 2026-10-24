"""Pause routes: pause and resume a project, and read its pauses."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import RootModel

from backend.app.api.dependencies import PauseUnitOfWork, pause_unit_of_work, request_context
from backend.app.study.domain.context import RequestContext
from backend.app.timing.application.pause_service import PauseResult, PauseView
from backend.app.timing.domain.errors import (
    AlreadyPaused,
    NotAllowed,
    NotPaused,
    PauseError,
    ProjectNotFound,
)

router = APIRouter(prefix="/api/projects", tags=["pauses"])

Context = Annotated[RequestContext, Depends(request_context)]
Unit = Annotated[PauseUnitOfWork, Depends(pause_unit_of_work)]

_HTTP_STATUS = {NotAllowed: 403, AlreadyPaused: 409, NotPaused: 409}


# Values are typed as Any on purpose: the domain is the single place that validates them, so
# every bad type or range answers with the same `required_field` / `invalid_field` error.
class PauseInput(RootModel[dict[str, Any]]):
    pass


def _pause_json(view: PauseView) -> dict[str, Any]:
    pause = view.pause
    return {
        "id": pause.id,
        "phase": pause.phase,
        "reason": pause.reason.value,
        "started_on": pause.started_on.isoformat(),
        "expected_resumption": pause.expected_resumption.isoformat(),
        "resumed_on": None if pause.resumed_on is None else pause.resumed_on.isoformat(),
        "overdue": view.overdue,
        "days_overdue": view.days_overdue,
    }


def _not_found(error: ProjectNotFound) -> HTTPException:
    return HTTPException(404, detail={"code": error.code, "message": str(error)})


def _answer(result: PauseResult) -> dict[str, Any]:
    # The transaction has already committed: a refusal for lack of permission is audited
    # before responding.
    if result.error is not None:
        raise _business_error(result.error)
    return _pause_json(result.view)


def _business_error(error: PauseError) -> HTTPException:
    detail: dict[str, Any] = {"code": error.code, "message": error.message}
    if error.field is not None:
        detail["field"] = error.field
    return HTTPException(_HTTP_STATUS.get(type(error), 422), detail=detail)


@router.post("/{code}/pause", status_code=201)
def pause_project(code: str, body: PauseInput, context: Context, open_unit: Unit) -> dict:
    try:
        with open_unit(context) as service:
            result = service.pause(context, code, body.root)
    except ProjectNotFound as error:
        raise _not_found(error) from error
    return _answer(result)


@router.post("/{code}/resume")
def resume_project(code: str, context: Context, open_unit: Unit) -> dict:
    try:
        with open_unit(context) as service:
            result = service.resume(context, code)
    except ProjectNotFound as error:
        raise _not_found(error) from error
    return _answer(result)


@router.get("/{code}/pauses")
def get_pauses(code: str, context: Context, open_unit: Unit) -> dict:
    try:
        with open_unit(context) as service:
            history = service.history(code)
    except ProjectNotFound as error:
        raise _not_found(error) from error
    return {
        "active": None if history.active is None else _pause_json(history.active),
        "history": [_pause_json(view) for view in history.history],
    }
