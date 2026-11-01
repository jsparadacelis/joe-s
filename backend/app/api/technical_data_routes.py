"""Technical data routes: the values of the property, where they come from and who checked them.

Reading is open to any member of the study; changing needs authority over the project (decided
by the central policy, in the use case) and the Briefing phase.
"""

from __future__ import annotations

from datetime import timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict

from backend.app.api.dependencies import (
    RefreshTechnicalDataUnitOfWork,
    TechnicalDataUnitOfWork,
    refresh_technical_data_unit_of_work,
    request_context,
    technical_data_unit_of_work,
)
from backend.app.external_data.domain.cadastral_reference import InvalidCadastralReference
from backend.app.external_data.domain.errors import CadastreError, CadastreNotFound
from backend.app.lifecycle.domain.errors import NoAuthority
from backend.app.study.domain.context import RequestContext
from backend.app.technical_data.application.common import TechnicalDataResult
from backend.app.technical_data.domain.datum import TechnicalDatum
from backend.app.technical_data.domain.errors import (
    ProjectNotFound,
    TechnicalDataNotEditable,
    UnknownDatum,
)

router = APIRouter(prefix="/api/projects/{code}/technical-data", tags=["technical-data"])

Context = Annotated[RequestContext, Depends(request_context)]
Unit = Annotated[TechnicalDataUnitOfWork, Depends(technical_data_unit_of_work)]
RefreshUnit = Annotated[
    RefreshTechnicalDataUnitOfWork, Depends(refresh_technical_data_unit_of_work)
]

_STATUS = {
    ProjectNotFound: 404,
    UnknownDatum: 404,
    NoAuthority: 403,
    TechnicalDataNotEditable: 409,
}


# `value` is typed as Any on purpose: the domain validates it, so a value of the wrong type is
# rejected, audited and answered like any other invalid value.
class ValueInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: Any


class RefreshInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cadastral_reference: str


def _datum_json(datum: TechnicalDatum) -> dict[str, Any]:
    return {
        "id": datum.field_id,
        "value": datum.value,
        "original": datum.original,
        "verified": datum.verified,
        "edited": datum.edited,
        "source": datum.source.value,
    }


def _sheet_json(result: TechnicalDataResult) -> dict[str, Any]:
    query = result.last_query
    return {
        "cadastral_reference": None if query is None else query.cadastral_reference,
        "queried_on": None
        if query is None
        else query.queried_at.astimezone(timezone.utc).date().isoformat(),
        "data": [_datum_json(datum) for datum in result.sheet.data],
    }


def _answer(result: TechnicalDataResult) -> TechnicalDataResult:
    # The transaction has already committed: a refusal is audited before responding.
    if result.error is not None:
        error: Any = result.error
        detail = {"code": error.code, "message": error.message}
        if isinstance(error, NoAuthority):
            detail.update(error.details())
        raise HTTPException(_STATUS.get(type(error), 422), detail=detail)
    return result


def _datum_answer(result: TechnicalDataResult, field_id: str) -> dict[str, Any]:
    return _datum_json(_answer(result).sheet.get(field_id))


@router.get("")
def get_technical_data(code: str, context: Context, open_unit: Unit) -> dict:
    with open_unit(context) as use_cases:
        result = use_cases.get.execute(context, code)
    return _sheet_json(_answer(result))


@router.put("/{field_id}")
def edit_datum(
    code: str, field_id: str, body: ValueInput, context: Context, open_unit: Unit
) -> dict:
    with open_unit(context) as use_cases:
        result = use_cases.edit.execute(context, code, field_id, body.value)
    return _datum_answer(result, field_id)


@router.post("/verify-all")
def verify_all(code: str, context: Context, open_unit: Unit) -> dict:
    with open_unit(context) as use_cases:
        result = use_cases.verify_all.execute(context, code)
    return _sheet_json(_answer(result))


@router.post("/refresh")
def refresh(code: str, body: RefreshInput, context: Context, open_unit: RefreshUnit) -> dict:
    try:
        with open_unit(context) as refresher:
            result = refresher.execute(context, code, body.cadastral_reference)
    except (InvalidCadastralReference, CadastreError) as error:
        if isinstance(error, InvalidCadastralReference):
            status = 422
        else:
            status = 404 if isinstance(error, CadastreNotFound) else 503
        raise HTTPException(
            status, detail={"code": error.code, "message": error.message}
        ) from error
    return {**_sheet_json(_answer(result)), "unmapped": list(result.unmapped)}


@router.post("/{field_id}/restore")
def restore_datum(code: str, field_id: str, context: Context, open_unit: Unit) -> dict:
    with open_unit(context) as use_cases:
        result = use_cases.restore.execute(context, code, field_id)
    return _datum_answer(result, field_id)


@router.post("/{field_id}/verify")
def verify_datum(code: str, field_id: str, context: Context, open_unit: Unit) -> dict:
    with open_unit(context) as use_cases:
        result = use_cases.verify.execute(context, code, field_id)
    return _datum_answer(result, field_id)
