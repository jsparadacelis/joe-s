"""GET /api/to-promote: the state of every project's exit deliverable. Read only, open to any
person of the study. It never changes a state: promoting stays an explicit act elsewhere."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from backend.app.api.dependencies import (
    ToPromoteUnitOfWork,
    request_context,
    to_promote_unit_of_work,
)
from backend.app.study.domain.context import RequestContext
from backend.app.to_promote.application.queue import ToPromoteItem

router = APIRouter(prefix="/api/to-promote", tags=["to-promote"])

Context = Annotated[RequestContext, Depends(request_context)]
Unit = Annotated[ToPromoteUnitOfWork, Depends(to_promote_unit_of_work)]


def _item_json(item: ToPromoteItem) -> dict:
    return {
        "code": item.code,
        "name": item.name,
        "phase": item.phase,
        "phase_name": item.phase_name,
        "deliverable": item.deliverable,
        "state": item.state,
        "reason": item.reason,
        "promoter": item.promoter,
        "can_promote": item.can_promote,
    }


@router.get("")
def get_to_promote(context: Context, open_unit: Unit) -> dict:
    with open_unit(context) as queue:
        answer = queue.execute(context)
    return {
        "ready_count": answer.ready_count,
        "projects": [_item_json(item) for item in answer.items],
    }
