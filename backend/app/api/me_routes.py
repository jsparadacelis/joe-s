"""Who the authenticated request is: the front shows the person and their role."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from backend.app.api.dependencies import request_context
from backend.app.study.domain.context import RequestContext

router = APIRouter(prefix="/api", tags=["me"])

Context = Annotated[RequestContext, Depends(request_context)]


@router.get("/me")
def me(context: Context) -> dict:
    return {
        "role": context.role.value,
        "qualifications": sorted(q.value for q in context.qualifications),
    }
