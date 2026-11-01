"""Cross-data alerts (RGB-31): inconsistencies between technical data and the project sheet.

Pure and read only: alerts INFORM, they never change a datum or a state. They are computed on
every read from the current values, so they disappear when the cause is fixed. Every rule is
tolerant: a missing, blank or non-numeric datum raises no alert, and when in doubt neither.

The thresholds and the use/typology table are business rules kept in `AlertConfig`, with
default values, so a study can change them later. FOR REVIEW WITH RGB: every default here.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum

from backend.app.technical_data.domain.capacity import parse_number

CADASTRAL_AREA = "cadastralPlotArea"
POLYGON_AREA = "polygonPlotArea"
USE = "use"
YEAR = "year"
SLOPE = "slope"
MUNICIPALITY = "municipality"

_ONE_HUNDRED = Decimal(100)
_YEAR = re.compile(r"[12][0-9]{3}")
_PROVINCE = re.compile(r"^(.*?)\s*\((.*)\)\s*$")
_SEGMENT_SEPARATORS = re.compile(r"[,;/()\-]")
_NOT_ALPHANUMERIC = re.compile(r"[^a-z0-9]+")
# Articles and prepositions that vary between sources («CORUÑA, A» / «A Coruña»).
_STOPWORDS = frozenset(
    {"el", "la", "los", "las", "de", "del", "d", "l", "a", "en", "i", "y", "els", "les"}
)

# Uses (catalog values of `use`) that clearly do not fit a typology (project_type of the sheet).
# Conservative on purpose: only a clear incoherence alerts. A typology missing from the table
# (rehabilitation, interiors: any use is possible) never alerts, nor does a use not listed.
_HOUSING_INCOMPATIBLE = frozenset(
    {
        "Industrial",
        "Sanidad y beneficencia",
        "Religioso",
        "Espectáculos",
        "Deportivo",
        "Cultural",
        "Ocio y hostelería",
    }
)
DEFAULT_INCOMPATIBLE_USES: Mapping[str, frozenset[str]] = {
    "single_family_house": _HOUSING_INCOMPATIBLE | {"Oficinas", "Comercial"},
    "multi_family": _HOUSING_INCOMPATIBLE,
    "facility": frozenset({"Residencial", "Industrial"}),
    "industrial": frozenset(
        {
            "Residencial",
            "Sanidad y beneficencia",
            "Religioso",
            "Cultural",
            "Espectáculos",
            "Deportivo",
            "Ocio y hostelería",
        }
    ),
}


class Severity(str, Enum):
    INFO = "info"
    WARNING = "warning"


@dataclass(frozen=True)
class Alert:
    code: str
    severity: Severity
    message: str
    suggestion: str
    fields: tuple[str, ...]


@dataclass(frozen=True)
class ProjectFacts:
    """What the project sheet says; `None` when it does not say."""

    project_type: str | None
    location: str | None


@dataclass(frozen=True)
class AlertConfig:
    area_difference_percent: Decimal = Decimal(3)  # relative to the cadastral surface
    slope_percent: Decimal = Decimal(10)
    built_before_year: int = 1980  # strictly before
    incompatible_uses: Mapping[str, frozenset[str]] = field(
        default_factory=lambda: dict(DEFAULT_INCOMPATIBLE_USES)
    )


def _text(values: Mapping[str, str], field_id: str) -> str:
    raw = values.get(field_id)
    return raw.strip() if isinstance(raw, str) else ""


def _percent(value: Decimal) -> str:
    return f"{value:.1f}".replace(".", ",")


def area_mismatch(values: Mapping[str, str], config: AlertConfig) -> Alert | None:
    cadastral = parse_number(values.get(CADASTRAL_AREA))
    polygon = parse_number(values.get(POLYGON_AREA))
    if cadastral is None or polygon is None or cadastral == 0:
        return None
    difference = abs(polygon - cadastral) / cadastral * _ONE_HUNDRED
    if difference <= config.area_difference_percent:
        return None
    return Alert(
        code="area_mismatch",
        severity=Severity.WARNING,
        message=(
            f"La superficie del Catastro ({_text(values, CADASTRAL_AREA)} m²) y la del polígono "
            f"({_text(values, POLYGON_AREA)} m²) difieren un {_percent(difference)} %."
        ),
        suggestion="Conviene encargar un levantamiento topográfico.",
        fields=(CADASTRAL_AREA, POLYGON_AREA),
    )


def use_mismatch(
    values: Mapping[str, str], facts: ProjectFacts, config: AlertConfig
) -> Alert | None:
    use = _text(values, USE)
    incompatible = config.incompatible_uses.get(facts.project_type or "", frozenset())
    if use not in incompatible:
        return None
    return Alert(
        code="use_mismatch",
        severity=Severity.WARNING,
        message=f"El uso catastral ({use}) no parece encajar con la tipología de la ficha.",
        suggestion="Posible cambio de uso: compruebe la viabilidad urbanística y la licencia.",
        fields=(USE,),
    )


def old_building(values: Mapping[str, str], config: AlertConfig) -> Alert | None:
    text = _text(values, YEAR)
    if _YEAR.fullmatch(text) is None or int(text) >= config.built_before_year:
        return None
    return Alert(
        code="pre_1980_building",
        severity=Severity.INFO,
        message=f"La construcción es anterior a {config.built_before_year} (año {text}).",
        suggestion=(
            "Revise la estructura, la posible presencia de amianto y la normativa aplicable "
            "al edificio existente."
        ),
        fields=(YEAR,),
    )


def steep_slope(values: Mapping[str, str], config: AlertConfig) -> Alert | None:
    slope = parse_number(values.get(SLOPE))
    if slope is None or slope <= config.slope_percent:
        return None
    return Alert(
        code="steep_slope",
        severity=Severity.INFO,
        message=(
            f"La pendiente del terreno ({_text(values, SLOPE)} %) supera el "
            f"{_percent(config.slope_percent).removesuffix(',0')} %."
        ),
        suggestion="Conviene un levantamiento topográfico y estudiar contenciones.",
        fields=(SLOPE,),
    )


def _normalize(text: str) -> str:
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return _NOT_ALPHANUMERIC.sub(" ", plain.lower()).strip()


def _tokens(text: str) -> frozenset[str]:
    return frozenset(_normalize(text).split()) - _STOPWORDS


def municipality_mismatch(values: Mapping[str, str], facts: ProjectFacts) -> Alert | None:
    """«MUNICIPIO (PROVINCIA)» against free text. Coherent when the municipality (or one of its
    names, «ALICANTE/ALACANT») is contained in the location, when a part of the location is a
    part of the municipality name («Alcalá»), or when the location names the province."""
    municipality = _text(values, MUNICIPALITY)
    location = (facts.location or "").strip()
    match = _PROVINCE.match(municipality)
    name, province = (match.group(1), match.group(2)) if match else (municipality, "")
    names = [t for t in (_tokens(alt) for alt in name.split("/")) if t]
    location_tokens = _tokens(location)
    if not names or not location_tokens:
        return None
    segments = [t for t in (_tokens(s) for s in _SEGMENT_SEPARATORS.split(location)) if t]
    province_tokens = _tokens(province)
    coherent = (
        any(n <= location_tokens for n in names)
        or any(s <= n for s in segments for n in names)
        or (bool(province_tokens) and province_tokens <= location_tokens)
    )
    if coherent:
        return None
    return Alert(
        code="municipality_mismatch",
        severity=Severity.WARNING,
        message=(
            f"El municipio del Catastro ({municipality}) no coincide con la ubicación de la "
            f"ficha ({location})."
        ),
        suggestion="Compruebe la referencia catastral y la ubicación del proyecto.",
        fields=(MUNICIPALITY,),
    )


def evaluate_alerts(
    values: Mapping[str, str], facts: ProjectFacts, config: AlertConfig
) -> list[Alert]:
    """`values` maps a technical datum id to its current text. Fixed order, nothing modified."""
    found = (
        area_mismatch(values, config),
        use_mismatch(values, facts, config),
        old_building(values, config),
        steep_slope(values, config),
        municipality_mismatch(values, facts),
    )
    return [alert for alert in found if alert is not None]
