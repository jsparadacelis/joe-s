"""The fictitious content of the demonstration study (RGB-7): pure data, no database.

Everything here is invented. Emails use the reserved `example.com` domain, names and places are
made up, and the cadastral references carry a marker and cannot exist (see
`fictitious_cadastral_reference`). No owner data of any kind is part of the demo.
User-facing text is Spanish; identifiers are English.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from backend.app.study.domain.context import Qualification, Role

DEMO_STUDY_ID = "00000000-0000-0000-0000-00000000de00"
DEMO_STUDY_NAME = "Estudio de demostración (ficticio)"
# The actor of every write the seed makes: audit, scoring, promotions, pauses, assignments.
SEED_USER = "seed"


@dataclass(frozen=True)
class MemberSpec:
    email: str
    user_id: str  # a made-up Supabase `sub`: no real account exists behind it
    display_name: str
    role: Role
    label: str  # how the demo documentation names this person (Spanish)
    qualifications: frozenset[Qualification] = frozenset()


MEMBERS: tuple[MemberSpec, ...] = (
    MemberSpec(
        "socio@example.com",
        "demo-partner",
        "Ana Ejemplo",
        Role.PARTNER,
        "Socia (también sponsor)",
        frozenset({Qualification.SPONSOR}),
    ),
    MemberSpec("director@example.com", "demo-director", "Bruno Muestra", Role.DIRECTOR, "Director"),
    MemberSpec(
        "director.proyecto@example.com",
        "demo-project-director",
        "Carla Prueba",
        Role.PROJECT_DIRECTOR,
        "Directora de proyecto",
    ),
    MemberSpec(
        "lider.tecnico@example.com",
        "demo-technical-lead",
        "Daniel Simulado",
        Role.TECHNICAL_LEAD,
        "Líder técnico",
    ),
    MemberSpec(
        "arquitecta@example.com", "demo-architect", "Elena Ficticia", Role.ARCHITECT, "Arquitecta"
    ),
    MemberSpec(
        "colaborador.obra@example.com",
        "demo-site-collaborator",
        "Fernando Demo",
        Role.SITE_COLLABORATOR,
        "Colaborador de obra",
    ),
    MemberSpec(
        "administracion@example.com",
        "demo-administration",
        "Gloria Piloto",
        Role.ADMINISTRATION,
        "Administración",
    ),
    MemberSpec(
        "firmante@example.com",
        "demo-licensed-signatory",
        "Héctor Modelo",
        Role.ARCHITECT,
        "Arquitecto firmante habilitado",
        frozenset({Qualification.LICENSED_SIGNATORY}),
    ),
    MemberSpec(
        "direccion.facultativa@example.com",
        "demo-site-management",
        "Irene Maqueta",
        Role.ARCHITECT,
        "Arquitecta con dirección facultativa",
        frozenset({Qualification.SITE_MANAGEMENT}),
    ),
)

# A real reference starts with seven digits (the plot) and ends with letters and digits that
# the Catastro issues. These start with letters, so none of them can be a real parcel.
FICTITIOUS_PREFIX = "FICT"
_FICTITIOUS_MARK = "DEMO"
_MAX_INDEX = 9999


def fictitious_cadastral_reference(index: int) -> str:
    """A 20-character reference that passes `validate_cadastral_reference` and cannot exist:
    `FICT` + 4 digits + `DEMO` + the same 4 digits + `ZZZZ`."""
    if not 1 <= index <= _MAX_INDEX:
        raise ValueError(f"index must be between 1 and {_MAX_INDEX}")
    return f"{FICTITIOUS_PREFIX}{index:04d}{_FICTITIOUS_MARK}{index:04d}ZZZZ"


def is_fictitious_reference(reference: str) -> bool:
    return (
        len(reference) == 20
        and reference.startswith(FICTITIOUS_PREFIX)
        and reference[8:12] == _FICTITIOUS_MARK
    )


# Invented values for the 26 technical data, all valid for the catalog. Planning data are typed
# in by hand (source `manual`); the rest pretend to come from their usual origin.
TECHNICAL_DATA: dict[str, str] = {
    "address": "Calle Ficticia 12",
    "municipality": "VILLA EJEMPLO (PROVINCIA EJEMPLO)",
    "propertyClass": "Urbano",
    "use": "Residencial",
    "year": "1992",
    "builtArea": "182,5",
    "cadastralPlotArea": "420",
    "polygonPlotArea": "421",
    "coords": "40.4000, -3.7000",
    "altitude": "712",
    "slope": "4,5",
    "slopeType": "Suave (3–10 %)",
    "climateZone": "D3",
    "seismicAcceleration": "< 0,04 g",
    "kCoefficient": "1,0",
    "windZone": "A",
    "snowZone": "2",
    "pvProduction": "1650",
    "buildability": "0,6",
    "maxOccupancy": "40",
    "maxHeight": "9",
    "floors": "PB+1",
    "streetSetback": "3",
    "boundarySetback": "3",
    "minPlot": "300",
    "calcArea": "Catastral",
}

RATINGS_HIGH = {
    "client_fit": 5,
    "location": 4,
    "typology": 5,
    "budget": 4,
    "timeline": 4,
    "source": 5,
    "probability": 4,
}
RATINGS_LOW = {
    "client_fit": 2,
    "location": 2,
    "typology": 1,
    "budget": 2,
    "timeline": 3,
    "source": 2,
    "probability": 2,
}
RATINGS_MEDIUM = {
    "client_fit": 4,
    "location": 3,
    "typology": 4,
    "budget": 3,
    "timeline": 4,
    "source": 3,
    "probability": 4,
}


@dataclass(frozen=True)
class ProjectSpec:
    name: str
    client: str
    location: str
    project_type: str
    scale: str
    owner: str  # free text, as in the opportunity form
    target_phase: int
    ratings: dict[str, int]
    estimated_budget: int
    deadline_in_days: int
    source: str
    traffic_light: str | None = None
    next_milestone: str | None = None
    pause: str | None = None  # "active" or "overdue"
    cadastral_index: int | None = None
    # Differences from TECHNICAL_DATA for this project.
    technical_overrides: dict[str, str] = field(default_factory=dict)
    # Fields a person edited: field -> the value the query returned (the original).
    technical_edits: dict[str, str] = field(default_factory=dict)


PROJECTS: tuple[ProjectSpec, ...] = (
    ProjectSpec(
        "Vivienda unifamiliar Los Almendros (demo)",
        "Familia Ejemplo Norte",
        "Villa Ejemplo (Provincia Ejemplo)",
        "single_family_house",
        "medium",
        "Carla Prueba",
        0,
        RATINGS_HIGH,
        420_000,
        240,
        "Recomendación de un cliente anterior (ficticia)",
    ),
    ProjectSpec(
        "Nave logística Polígono Norte (demo)",
        "Logística Muestra S.L.",
        "Polígono Muestra (Provincia Ejemplo)",
        "industrial",
        "large",
        "Bruno Muestra",
        0,
        RATINGS_LOW,
        1_800_000,
        150,
        "Concurso público (ficticio)",
    ),
    ProjectSpec(
        "Rehabilitación Casa del Molino (demo)",
        "Asociación Molino Ejemplo",
        "Villa Ejemplo (Provincia Ejemplo)",
        "rehabilitation",
        "small",
        "Carla Prueba",
        1,
        RATINGS_MEDIUM,
        310_000,
        300,
        "Contacto directo (ficticio)",
        traffic_light="green",
        next_milestone="Reunión de arranque con el cliente",
        cadastral_index=1,
    ),
    ProjectSpec(
        "Edificio de 12 viviendas Calle Muestra (demo)",
        "Promociones Alfa Ejemplo S.L.",
        "Villa Ejemplo (Provincia Ejemplo)",
        "multi_family",
        "large",
        "Carla Prueba",
        2,
        RATINGS_HIGH,
        2_400_000,
        420,
        "Cliente recurrente (ficticio)",
        traffic_light="amber",
        next_milestone="Respuesta del cliente al brief",
        pause="active",
        cadastral_index=2,
        technical_overrides={"year": "1965", "polygonPlotArea": "480", "use": "Industrial"},
    ),
    ProjectSpec(
        "Centro de día Ribera (demo)",
        "Fundación Ribera Ejemplo",
        "Ribera Ejemplo (Provincia Ejemplo)",
        "facility",
        "medium",
        "Daniel Simulado",
        3,
        RATINGS_MEDIUM,
        1_250_000,
        500,
        "Concurso privado (ficticio)",
        traffic_light="amber",
        next_milestone="Entrega del paquete de anteproyecto",
        cadastral_index=3,
        technical_overrides={
            "slope": "12",
            "slopeType": "Moderada (10–20 %)",
            "builtArea": "190",
        },
        technical_edits={"builtArea": "182,5"},
    ),
    ProjectSpec(
        "Reforma de oficinas Plaza Mayor (demo)",
        "Consultora Piloto S.A.",
        "Villa Ejemplo (Provincia Ejemplo)",
        "renovation_interiors",
        "small",
        "Carla Prueba",
        4,
        RATINGS_HIGH,
        380_000,
        260,
        "Cliente recurrente (ficticio)",
        traffic_light="red",
        next_milestone="Licencia de obras",
        pause="overdue",
        cadastral_index=4,
    ),
    ProjectSpec(
        "Vivienda unifamiliar Pinar Alto (demo)",
        "Familia Ejemplo Sur",
        "Pinar Ejemplo (Provincia Ejemplo)",
        "single_family_house",
        "large",
        "Carla Prueba",
        5,
        RATINGS_HIGH,
        690_000,
        200,
        "Recomendación de un cliente anterior (ficticia)",
        traffic_light="red",
        next_milestone="Visado del proyecto de ejecución",
        cadastral_index=5,
    ),
    ProjectSpec(
        "Rehabilitación Palacete Ejemplo (demo)",
        "Hotelera Muestra S.L.",
        "Villa Ejemplo (Provincia Ejemplo)",
        "rehabilitation",
        "medium",
        "Carla Prueba",
        6,
        RATINGS_HIGH,
        1_900_000,
        120,
        "Contacto directo (ficticio)",
        traffic_light="green",
        next_milestone="Certificación de la fase de estructura",
        cadastral_index=6,
    ),
)


def team_for_phase(phase: int) -> tuple[tuple[str, str], ...]:
    """(project function, `user_id` of the member) the demo assigns to a project in that phase.

    Phase 2 onwards has a project team; the signing functions appear when their phase does.
    Values of `ProjectRole`, as text so this module stays free of other contexts.
    """
    if phase < 2:
        return ()
    team = [
        ("project_director", "demo-project-director"),
        ("technical_lead", "demo-technical-lead"),
        ("architect", "demo-architect"),
        ("sponsor", "demo-partner"),
    ]
    if phase >= 4:
        team.append(("licensed_signatory", "demo-licensed-signatory"))
    if phase >= 6:
        team += [
            ("site_management", "demo-site-management"),
            ("site_collaborator", "demo-site-collaborator"),
        ]
    return tuple(team)
