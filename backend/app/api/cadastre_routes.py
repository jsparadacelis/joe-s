"""Cadastre route: property data by cadastral reference (read-only, any member of the study)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from backend.app.api.dependencies import CadastreUnitOfWork, cadastre_unit_of_work, request_context
from backend.app.external_data.domain.cadastral_reference import InvalidCadastralReference
from backend.app.external_data.domain.errors import CadastreError, CadastreNotFound
from backend.app.study.domain.context import RequestContext

router = APIRouter(prefix="/api", tags=["cadastre"])

Context = Annotated[RequestContext, Depends(request_context)]
Unit = Annotated[CadastreUnitOfWork, Depends(cadastre_unit_of_work)]


def _rejected(error: InvalidCadastralReference | CadastreError) -> HTTPException:
    if isinstance(error, InvalidCadastralReference):
        status = 422
    else:
        status = 404 if isinstance(error, CadastreNotFound) else 503
    return HTTPException(status, detail={"code": error.code, "message": error.message})


@router.get("/cadastre/{reference}")
def get_cadastral_property(reference: str, context: Context, open_unit: Unit) -> dict:
    try:
        with open_unit(context) as service:
            found = service.execute(reference)
    except (InvalidCadastralReference, CadastreError) as error:
        raise _rejected(error) from error
    return found.to_dict()
