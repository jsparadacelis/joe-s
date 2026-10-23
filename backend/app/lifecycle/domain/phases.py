"""The 8 phase-states of a project, with their exit deliverable and authority (PRD).

Names and deliverables are user-facing Spanish text."""

from __future__ import annotations

from dataclasses import dataclass

LAST_PHASE = 7


@dataclass(frozen=True)
class PhaseDefinition:
    id: int
    name: str
    exit_deliverable: str
    authority: str


PHASES: tuple[PhaseDefinition, ...] = (
    PhaseDefinition(
        0,
        "Oportunidad",
        "Scoring (7 criterios de 1 a 5, nota sobre 100, umbral) + tipología y escala → plan de semanas",
        "partner_director",
    ),
    PhaseDefinition(
        1,
        "Inicio",
        "Ficha del proyecto completa (incluye referencia catastral, contrato, gobierno, repositorio)",
        "partner_director",
    ),
    PhaseDefinition(
        2,
        "Briefing y concepto",
        "Datos técnicos del inmueble verificados + brief manual (con topográfico y alineación) + aprobación del cliente registrada",
        "project_director",
    ),
    PhaseDefinition(
        3,
        "Anteproyecto",
        "Paquete de anteproyecto aprobado y congelado; visor de relieve 3D como apoyo",
        "project_director",
    ),
    PhaseDefinition(
        4,
        "Proyecto básico",
        "Básico emitido y licencia concedida con condiciones",
        "licensed_signatory",
    ),
    PhaseDefinition(
        5,
        "Proyecto de ejecución",
        "Ejecución coordinada, visada y emitida",
        "licensed_signatory",
    ),
    PhaseDefinition(
        6,
        "Obra",
        "Registro de obra completo y recepción",
        "site_management",
    ),
    PhaseDefinition(
        7,
        "Cierre",
        "Certificado final, Libro del Edificio y lecciones",
        "sponsor",
    ),
)


def validate_phase(phase: int) -> int:
    if not 0 <= phase <= LAST_PHASE:
        raise ValueError(f"phase {phase} does not exist: it must be between 0 and {LAST_PHASE}")
    return phase


def phase_definition(phase: int) -> PhaseDefinition:
    return PHASES[validate_phase(phase)]


def next_phase(phase: int) -> int | None:
    validate_phase(phase)
    return None if phase == LAST_PHASE else phase + 1
