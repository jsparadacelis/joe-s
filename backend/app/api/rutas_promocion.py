"""Rutas de promoción: promover, retener y no perseguir un proyecto."""

from __future__ import annotations

from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.app.api.dependencies import UnidadDeTrabajo, contexto_de_solicitud, unidad_de_trabajo
from backend.app.ciclo_de_vida.application.servicio_promocion import (
    ServicioDePromocion,
    Transicion,
)
from backend.app.ciclo_de_vida.domain.errores import (
    AccionNoPermitida,
    EntregableIncompleto,
    MotivoObligatorio,
    ProyectoNoEncontrado,
    SinAutoridad,
    SinFaseSiguiente,
)
from backend.app.estudio.domain.contexto import ContextoDeSolicitud

router = APIRouter(prefix="/api/proyectos", tags=["promoción"])

_ESTADO_HTTP = {
    SinAutoridad: 403,
    EntregableIncompleto: 422,
    MotivoObligatorio: 422,
    SinFaseSiguiente: 409,
    AccionNoPermitida: 409,
}

Contexto = Annotated[ContextoDeSolicitud, Depends(contexto_de_solicitud)]
Unidad = Annotated[UnidadDeTrabajo, Depends(unidad_de_trabajo)]


class MotivoEntrada(BaseModel):
    motivo: str


def _ejecutar(
    abrir: UnidadDeTrabajo,
    contexto: ContextoDeSolicitud,
    codigo: str,
    accion: Callable[[ServicioDePromocion], Transicion],
) -> dict:
    try:
        with abrir(contexto) as servicio:
            transicion = accion(servicio)
    except ProyectoNoEncontrado as error:
        raise HTTPException(404, detail={"codigo": error.codigo, "mensaje": str(error)}) from error
    # La transacción ya confirmó: el rechazo queda auditado antes de responder.
    if not transicion.ok:
        error = transicion.error
        raise HTTPException(
            _ESTADO_HTTP.get(type(error), 409),
            detail={"codigo": error.codigo, "mensaje": error.mensaje, **error.detalle()},
        )
    return {
        "codigo": codigo,
        "accion": transicion.accion,
        "fase_anterior": transicion.fase_anterior,
        "fase_actual": transicion.fase_actual,
        "version_congelada": transicion.version_congelada,
    }


@router.post("/{codigo}/promover")
def promover(codigo: str, contexto: Contexto, abrir: Unidad) -> dict:
    return _ejecutar(abrir, contexto, codigo, lambda s: s.promover(contexto, codigo))


@router.post("/{codigo}/retener")
def retener(codigo: str, cuerpo: MotivoEntrada, contexto: Contexto, abrir: Unidad) -> dict:
    return _ejecutar(abrir, contexto, codigo, lambda s: s.retener(contexto, codigo, cuerpo.motivo))


@router.post("/{codigo}/no-perseguir")
def no_perseguir(codigo: str, cuerpo: MotivoEntrada, contexto: Contexto, abrir: Unidad) -> dict:
    return _ejecutar(
        abrir, contexto, codigo, lambda s: s.no_perseguir(contexto, codigo, cuerpo.motivo)
    )
