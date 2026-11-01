"""The 26 technical data of a project. The screen's definitions (RGB-29,
`frontend/lib/technical-data.ts`) are the contract: `catalog_cases.json` is read by a back-end
test and a front-end test so the two cannot drift. Ids are the keys of the API."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from backend.app.technical_data.domain.errors import UnknownDatum


class DataGroup(str, Enum):
    PLOT = "plot"
    CONDITIONS = "conditions"
    PLANNING = "planning"


class DatumType(str, Enum):
    TEXT = "text"
    NUMBER = "number"
    LIST = "list"


class Source(str, Enum):
    """Where a datum comes from. `MANUAL` is typed in by a person."""

    CATASTRO = "catastro"
    INSPIRE = "inspire"
    OPEN_METEO = "open_meteo"
    CALCULATED = "calculated"
    CTE = "cte"
    NCSE = "ncse"
    PVGIS = "pvgis"
    MANUAL = "manual"


@dataclass(frozen=True)
class DatumDefinition:
    id: str
    group: DataGroup
    type: DatumType
    source: Source
    unit: str | None = None
    options: tuple[str, ...] | None = None


_USES = (
    "Residencial",
    "Industrial",
    "Oficinas",
    "Comercial",
    "Almacén y estacionamiento",
    "Ocio y hostelería",
    "Sanidad y beneficencia",
    "Cultural",
    "Deportivo",
    "Religioso",
    "Espectáculos",
    "Edificio singular",
    "Suelo sin edificar",
)
_ZONES = ("α3", "A2", "A3", "A4", "B2", "B3", "B4", "C1", "C2", "C3", "C4", "D1", "D2", "D3", "E1")
# "< 0,04 g", then from 0,04 g to 0,24 g in steps of 0,01.
_ACCELERATIONS = ("< 0,04 g", *(f"0,{4 + step:02d} g" for step in range(21)))
_SLOPE_TYPES = (
    "Llana (< 3 %)",
    "Suave (3–10 %)",
    "Moderada (10–20 %)",
    "Pronunciada (20–35 %)",
    "Muy pronunciada (> 35 %)",
)

_PLOT, _CONDITIONS, _PLANNING = DataGroup.PLOT, DataGroup.CONDITIONS, DataGroup.PLANNING
_TEXT, _NUMBER, _LIST = DatumType.TEXT, DatumType.NUMBER, DatumType.LIST

CATALOG: tuple[DatumDefinition, ...] = (
    DatumDefinition("address", _PLOT, _TEXT, Source.CATASTRO),
    DatumDefinition("municipality", _PLOT, _TEXT, Source.CATASTRO),
    DatumDefinition("propertyClass", _PLOT, _LIST, Source.CATASTRO, options=("Urbano", "Rústico")),
    DatumDefinition("use", _PLOT, _LIST, Source.CATASTRO, options=_USES),
    DatumDefinition("year", _PLOT, _NUMBER, Source.CATASTRO),
    DatumDefinition("builtArea", _PLOT, _NUMBER, Source.CATASTRO, unit="m²"),
    DatumDefinition("cadastralPlotArea", _PLOT, _NUMBER, Source.CATASTRO, unit="m²"),
    DatumDefinition("polygonPlotArea", _PLOT, _NUMBER, Source.INSPIRE, unit="m²"),
    DatumDefinition("coords", _PLOT, _TEXT, Source.CATASTRO),
    DatumDefinition("altitude", _PLOT, _NUMBER, Source.OPEN_METEO, unit="m"),
    DatumDefinition("slope", _PLOT, _NUMBER, Source.CALCULATED, unit="%"),
    DatumDefinition("slopeType", _PLOT, _LIST, Source.CALCULATED, options=_SLOPE_TYPES),
    DatumDefinition("climateZone", _CONDITIONS, _LIST, Source.CTE, options=_ZONES),
    DatumDefinition("seismicAcceleration", _CONDITIONS, _LIST, Source.NCSE, options=_ACCELERATIONS),
    DatumDefinition(
        "kCoefficient", _CONDITIONS, _LIST, Source.NCSE, options=("1,0", "1,1", "1,2", "1,3")
    ),
    DatumDefinition("windZone", _CONDITIONS, _LIST, Source.CTE, options=("A", "B", "C")),
    DatumDefinition(
        "snowZone", _CONDITIONS, _LIST, Source.CTE, options=("1", "2", "3", "4", "5", "6", "7")
    ),
    DatumDefinition("pvProduction", _CONDITIONS, _NUMBER, Source.PVGIS, unit="kWh/kWp·año"),
    DatumDefinition("buildability", _PLANNING, _NUMBER, Source.MANUAL, unit="m²t/m²s"),
    DatumDefinition("maxOccupancy", _PLANNING, _NUMBER, Source.MANUAL, unit="%"),
    DatumDefinition("maxHeight", _PLANNING, _NUMBER, Source.MANUAL, unit="m"),
    DatumDefinition(
        "floors",
        _PLANNING,
        _LIST,
        Source.MANUAL,
        options=("PB", "PB+1", "PB+2", "PB+3", "PB+4", "PB+5"),
    ),
    DatumDefinition("streetSetback", _PLANNING, _NUMBER, Source.MANUAL, unit="m"),
    DatumDefinition("boundarySetback", _PLANNING, _NUMBER, Source.MANUAL, unit="m"),
    DatumDefinition("minPlot", _PLANNING, _NUMBER, Source.MANUAL, unit="m²"),
    DatumDefinition(
        "calcArea",
        _PLANNING,
        _LIST,
        Source.MANUAL,
        options=("Catastral", "Polígono", "Topográfico"),
    ),
)

_BY_ID = {definition.id: definition for definition in CATALOG}


def definition_of(field_id: str) -> DatumDefinition:
    """Raises `UnknownDatum` when the catalog has no such datum."""
    try:
        return _BY_ID[field_id]
    except KeyError:
        raise UnknownDatum() from None
