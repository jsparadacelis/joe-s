"""Buildable capacity route: read only, open to any member of the study.

The capacity is computed on every read from the saved technical data. When a mandatory datum is
missing the answer says which, instead of a made-up number.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException

from backend.app.api.dependencies import (
    TechnicalDataUnitOfWork,
    request_context,
    technical_data_unit_of_work,
)
from backend.app.study.domain.context import RequestContext
from backend.app.technical_data.domain.capacity import Capacity

router = APIRouter(prefix="/api/projects/{code}/capacity", tags=["capacity"])

Context = Annotated[RequestContext, Depends(request_context)]
Unit = Annotated[TechnicalDataUnitOfWork, Depends(technical_data_unit_of_work)]


def _number(value: Decimal | None) -> float | None:
    return None if value is None else float(value)


def _capacity_json(capacity: Capacity) -> dict[str, Any]:
    return {
        "surface": _number(capacity.surface),
        "buildable_area": _number(capacity.buildable_area),
        "footprint": _number(capacity.footprint),
        "by_floors": _number(capacity.by_floors),
        "maximum": _number(capacity.maximum),
        "limited_by": capacity.limited_by.value,
        "existing": _number(capacity.existing),
        "existing_share": _number(capacity.existing_share),
        "min_plot": _number(capacity.min_plot),
        "meets_min_plot": capacity.meets_min_plot,
    }


@router.get("")
def get_capacity(code: str, context: Context, open_unit: Unit) -> dict:
    with open_unit(context) as use_cases:
        answer = use_cases.capacity.execute(context, code)
    if answer.error is not None:
        error: Any = answer.error
        raise HTTPException(404, detail={"code": error.code, "message": error.message})
    result = answer.result
    return {
        "capacity": None if result.capacity is None else _capacity_json(result.capacity),
        "missing": list(result.missing),
    }
