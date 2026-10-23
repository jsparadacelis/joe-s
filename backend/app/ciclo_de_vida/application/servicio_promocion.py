"""Promover, retener y no perseguir. Los rechazos se devuelven (no se lanzan) para que la
transacción confirme y el intento quede en el registro de auditoría."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.app.auditoria.application.auditar import audit
from backend.app.auditoria.domain.evento import Resultado
from backend.app.auditoria.domain.ports import RegistroDeAuditoria
from backend.app.ciclo_de_vida.domain.autoridad import quien_puede, tiene_autoridad
from backend.app.ciclo_de_vida.domain.errores import (
    AccionNoPermitida,
    EntregableIncompleto,
    ErrorDeNegocio,
    MotivoObligatorio,
    ProyectoNoEncontrado,
    SinAutoridad,
    SinFaseSiguiente,
)
from backend.app.ciclo_de_vida.domain.fases import ULTIMA_FASE, definicion_de_fase
from backend.app.ciclo_de_vida.domain.ports import CicloDeVidaRepositorio, ValidadorDeEntregable
from backend.app.ciclo_de_vida.domain.promocion import Accion, Promocion
from backend.app.ciclo_de_vida.domain.proyecto import Proyecto
from backend.app.ciclo_de_vida.domain.version_congelada import VersionCongelada
from backend.app.estudio.domain.contexto import ContextoDeSolicitud


@dataclass(frozen=True)
class Transicion:
    ok: bool
    accion: str
    fase_anterior: int
    fase_actual: int
    version_congelada: int | None
    error: ErrorDeNegocio | None


class ServicioDePromocion:
    def __init__(
        self,
        repo: CicloDeVidaRepositorio,
        auditoria: RegistroDeAuditoria,
        validadores: dict[int, ValidadorDeEntregable],
    ) -> None:
        self._repo = repo
        self._auditoria = auditoria
        self._validadores = validadores

    def promover(self, contexto: ContextoDeSolicitud, codigo: str) -> Transicion:
        proyecto = self._cargar(codigo)
        fase = proyecto.fase_actual
        if fase >= ULTIMA_FASE:
            return self._rechazar(contexto, proyecto, "promover", SinFaseSiguiente())
        if (error := self._sin_autoridad(contexto, proyecto)) is not None:
            return self._rechazar(contexto, proyecto, "promover", error)

        entregable = self._repo.obtener_entregable(proyecto.id, fase)
        if entregable is None:
            faltantes = ["entregable de salida"]
        else:
            faltantes = entregable.faltantes(self._validadores.get(fase))
        if faltantes:
            return self._rechazar(contexto, proyecto, "promover", EntregableIncompleto(faltantes))

        version = self._repo.proxima_version(proyecto.id, fase)
        self._repo.congelar(
            VersionCongelada.crear(
                estudio_id=proyecto.estudio_id,
                proyecto_id=proyecto.id,
                fase=fase,
                version=version,
                contenido=entregable.contenido,
                congelada_por=contexto.usuario_id,
            )
        )
        self._repo.registrar_promocion(
            Promocion(
                estudio_id=proyecto.estudio_id,
                proyecto_id=proyecto.id,
                accion=Accion.PROMOVER,
                de_fase=fase,
                a_fase=fase + 1,
                usuario_id=contexto.usuario_id,
            )
        )
        self._repo.cambiar_fase(proyecto.id, fase + 1)
        self._repo.abrir_entregable(proyecto.id, fase + 1)
        self._auditar(contexto, codigo, "promover", {"fase": fase}, {"fase": fase + 1}, version)
        return Transicion(True, "promover", fase, fase + 1, version, None)

    def retener(self, contexto: ContextoDeSolicitud, codigo: str, motivo: str | None) -> Transicion:
        return self._decidir(contexto, codigo, Accion.RETENER, motivo)

    def no_perseguir(
        self, contexto: ContextoDeSolicitud, codigo: str, motivo: str | None
    ) -> Transicion:
        return self._decidir(contexto, codigo, Accion.NO_PERSEGUIR, motivo)

    def _decidir(
        self, contexto: ContextoDeSolicitud, codigo: str, accion: Accion, motivo: str | None
    ) -> Transicion:
        proyecto = self._cargar(codigo)
        fase = proyecto.fase_actual
        if accion is Accion.NO_PERSEGUIR and fase != 0:
            return self._rechazar(contexto, proyecto, accion.value, AccionNoPermitida(accion.value))
        if (error := self._sin_autoridad(contexto, proyecto)) is not None:
            return self._rechazar(contexto, proyecto, accion.value, error)
        if not (motivo or "").strip():
            return self._rechazar(contexto, proyecto, accion.value, MotivoObligatorio(accion.value))

        self._repo.registrar_promocion(
            Promocion(
                estudio_id=proyecto.estudio_id,
                proyecto_id=proyecto.id,
                accion=accion,
                de_fase=fase,
                usuario_id=contexto.usuario_id,
                motivo=motivo,
            )
        )
        self._auditar(
            contexto, codigo, accion.value, {"fase": fase}, {"fase": fase, "motivo": motivo}, None
        )
        return Transicion(True, accion.value, fase, fase, None, None)

    def _cargar(self, codigo: str) -> Proyecto:
        proyecto = self._repo.obtener_proyecto(codigo)
        if proyecto is None:
            raise ProyectoNoEncontrado(codigo)
        return proyecto

    @staticmethod
    def _sin_autoridad(contexto: ContextoDeSolicitud, proyecto: Proyecto) -> SinAutoridad | None:
        autoridad = definicion_de_fase(proyecto.fase_actual).autoridad
        if tiene_autoridad(autoridad, contexto):
            return None
        return SinAutoridad(proyecto.fase_actual, quien_puede(autoridad))

    def _rechazar(
        self, contexto: ContextoDeSolicitud, proyecto: Proyecto, accion: str, error: ErrorDeNegocio
    ) -> Transicion:
        self._auditar(
            contexto,
            proyecto.codigo,
            accion,
            {"fase": proyecto.fase_actual},
            {"error": error.codigo},
            None,
            Resultado.RECHAZADO,
        )
        fase = proyecto.fase_actual
        return Transicion(False, accion, fase, fase, None, error)

    def _auditar(
        self,
        contexto: ContextoDeSolicitud,
        codigo: str,
        accion: str,
        anterior: Any,
        nuevo: Any,
        version: int | None,
        resultado: Resultado = Resultado.OK,
    ) -> None:
        audit(
            self._auditoria,
            contexto,
            entidad="proyecto",
            entidad_id=codigo,
            accion=accion,
            valor_anterior=anterior,
            valor_nuevo=nuevo,
            version=version,
            resultado=resultado,
        )
