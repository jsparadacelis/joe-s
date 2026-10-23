"""Rechazos de negocio del ciclo de vida, con mensajes claros en español."""

from __future__ import annotations

from typing import Any


class ErrorDeNegocio(Exception):
    codigo = "error_de_negocio"

    def __init__(self, mensaje: str) -> None:
        self.mensaje = mensaje
        super().__init__(mensaje)

    def detalle(self) -> dict[str, Any]:
        return {}


class SinAutoridad(ErrorDeNegocio):
    codigo = "sin_autoridad"

    def __init__(self, fase: int, pueden: list[str]) -> None:
        self.fase = fase
        self.pueden = pueden
        super().__init__(
            f"No tienes autoridad para esta acción en la fase {fase}. "
            f"Pueden hacerlo: {', '.join(pueden)}."
        )

    def detalle(self) -> dict[str, Any]:
        return {"pueden": self.pueden}


class EntregableIncompleto(ErrorDeNegocio):
    codigo = "entregable_incompleto"

    def __init__(self, faltantes: list[str]) -> None:
        self.faltantes = faltantes
        super().__init__(f"El entregable de salida no está listo. Falta: {', '.join(faltantes)}.")

    def detalle(self) -> dict[str, Any]:
        return {"faltantes": self.faltantes}


class SinFaseSiguiente(ErrorDeNegocio):
    codigo = "sin_fase_siguiente"

    def __init__(self) -> None:
        super().__init__("El proyecto ya está en la última fase (Cierre): no hay fase siguiente.")


class AccionNoPermitida(ErrorDeNegocio):
    codigo = "accion_no_permitida"

    def __init__(self, accion: str) -> None:
        super().__init__(
            "No perseguir solo es posible en la fase 0 (Oportunidad)."
            if accion == "no_perseguir"
            else f"La acción {accion} no está permitida en esta fase."
        )


class MotivoObligatorio(ErrorDeNegocio):
    codigo = "motivo_obligatorio"

    def __init__(self, accion: str) -> None:
        super().__init__(f"La acción «{accion.replace('_', ' ')}» exige un motivo.")


class ProyectoNoEncontrado(Exception):
    codigo = "proyecto_no_encontrado"

    def __init__(self, codigo_proyecto: str) -> None:
        self.codigo_proyecto = codigo_proyecto
        super().__init__(f"No existe el proyecto {codigo_proyecto}.")
