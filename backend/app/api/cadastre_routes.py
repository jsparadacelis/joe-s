"""Cadastre routes: property data, plot outline, terrain and photovoltaic yield by cadastral
reference (read-only, any member of the study)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from backend.app.api.dependencies import (
    CadastreUnitOfWork,
    PlotUnitOfWork,
    PvUnitOfWork,
    TerrainUnitOfWork,
    cadastre_unit_of_work,
    plot_unit_of_work,
    pv_unit_of_work,
    request_context,
    terrain_unit_of_work,
)
from backend.app.external_data.domain.cadastral_reference import InvalidCadastralReference
from backend.app.external_data.domain.errors import CadastreError, CadastreNotFound
from backend.app.study.domain.context import RequestContext

router = APIRouter(prefix="/api", tags=["cadastre"])

Context = Annotated[RequestContext, Depends(request_context)]
Unit = Annotated[CadastreUnitOfWork, Depends(cadastre_unit_of_work)]
PlotUnit = Annotated[PlotUnitOfWork, Depends(plot_unit_of_work)]
TerrainUnit = Annotated[TerrainUnitOfWork, Depends(terrain_unit_of_work)]
PvUnit = Annotated[PvUnitOfWork, Depends(pv_unit_of_work)]


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


@router.get("/cadastre/{reference}/plot")
def get_plot_geometry(reference: str, context: Context, open_unit: PlotUnit) -> dict:
    try:
        with open_unit(context) as service:
            found = service.execute(reference)
    except (InvalidCadastralReference, CadastreError) as error:
        raise _rejected(error) from error
    return found.to_dict()


@router.get("/cadastre/{reference}/terrain")
def get_terrain_profile(reference: str, context: Context, open_unit: TerrainUnit) -> dict:
    try:
        with open_unit(context) as service:
            found = service.execute(reference)
    except (InvalidCadastralReference, CadastreError) as error:
        raise _rejected(error) from error
    return found.to_dict()


@router.get("/cadastre/{reference}/pv")
def get_pv_yield(reference: str, context: Context, open_unit: PvUnit) -> dict:
    try:
        with open_unit(context) as service:
            found = service.execute(reference)
    except (InvalidCadastralReference, CadastreError) as error:
        raise _rejected(error) from error
    return found.to_dict()
