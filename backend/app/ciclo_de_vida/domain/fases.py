"""Las 8 fases-estado del proyecto, con su entregable de salida y su autoridad (PRD)."""

from __future__ import annotations

from dataclasses import dataclass

ULTIMA_FASE = 7


@dataclass(frozen=True)
class DefinicionDeFase:
    id: int
    nombre: str
    entregable_salida: str
    autoridad: str


FASES: tuple[DefinicionDeFase, ...] = (
    DefinicionDeFase(
        0,
        "Oportunidad",
        "Scoring (7 criterios de 1 a 5, nota sobre 100, umbral) + tipología y escala → plan de semanas",
        "socio_director",
    ),
    DefinicionDeFase(
        1,
        "Inicio",
        "Ficha del proyecto completa (incluye referencia catastral, contrato, gobierno, repositorio)",
        "socio_director",
    ),
    DefinicionDeFase(
        2,
        "Briefing y concepto",
        "Datos técnicos del inmueble verificados + brief manual (con topográfico y alineación) + aprobación del cliente registrada",
        "director_de_proyecto",
    ),
    DefinicionDeFase(
        3,
        "Anteproyecto",
        "Paquete de anteproyecto aprobado y congelado; visor de relieve 3D como apoyo",
        "director_de_proyecto",
    ),
    DefinicionDeFase(
        4,
        "Proyecto básico",
        "Básico emitido y licencia concedida con condiciones",
        "firmante_habilitado",
    ),
    DefinicionDeFase(
        5,
        "Proyecto de ejecución",
        "Ejecución coordinada, visada y emitida",
        "firmante_habilitado",
    ),
    DefinicionDeFase(
        6,
        "Obra",
        "Registro de obra completo y recepción",
        "direccion_facultativa",
    ),
    DefinicionDeFase(
        7,
        "Cierre",
        "Certificado final, Libro del Edificio y lecciones",
        "sponsor",
    ),
)


def validar_fase(fase: int) -> int:
    if not 0 <= fase <= ULTIMA_FASE:
        raise ValueError(f"fase {fase} no existe: debe estar entre 0 y {ULTIMA_FASE}")
    return fase


def definicion_de_fase(fase: int) -> DefinicionDeFase:
    return FASES[validar_fase(fase)]


def fase_siguiente(fase: int) -> int | None:
    validar_fase(fase)
    return None if fase == ULTIMA_FASE else fase + 1
