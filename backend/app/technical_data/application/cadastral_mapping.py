"""From what the Catastro says about a property to values for the catalog.

Only values the Catastro actually gave are returned; the domain then checks each one against
its field, so a value that does not fit is reported instead of written.
"""

from __future__ import annotations

from backend.app.external_data.domain.cadastral_property import CadastralProperty, PropertyClass
from backend.app.technical_data.domain.catalog import definition_of

# The data the Catastro can fill, in catalog order.
CADASTRE_FIELDS = (
    "address",
    "municipality",
    "propertyClass",
    "use",
    "year",
    "builtArea",
    "cadastralPlotArea",
    "coords",
)
_CLASS_NAMES = {PropertyClass.URBAN: "Urbano", PropertyClass.RUSTIC: "Rústico"}


def map_property(found: CadastralProperty) -> dict[str, str]:
    candidates = {
        "address": found.address,
        "municipality": _municipality(found),
        "propertyClass": _CLASS_NAMES.get(found.property_class),
        "use": _use(found.use),
        "year": _number(found.construction_year),
        "builtArea": _number(found.built_area_m2),
        "cadastralPlotArea": _number(found.plot_area_m2),
        "coords": _coordinates(found.latitude, found.longitude),
    }
    return {field_id: value for field_id, value in candidates.items() if value}


def _municipality(found: CadastralProperty) -> str:
    return f"{found.municipality} ({found.province})" if found.province else found.municipality


def _use(use: str | None) -> str | None:
    """The catalog option the use matches, ignoring case; `None` if it matches none."""
    wanted = (use or "").strip().casefold()
    options = definition_of("use").options or ()
    return next((option for option in options if option.casefold() == wanted), None)


def _number(number: int | None) -> str | None:
    return None if number is None else str(number)


def _coordinates(latitude: float | None, longitude: float | None) -> str | None:
    if latitude is None or longitude is None:
        return None
    north_south = "N" if latitude >= 0 else "S"
    east_west = "E" if longitude >= 0 else "W"
    return (
        f"{abs(latitude):.4f}".replace(".", ",")
        + f" {north_south} · "
        + f"{abs(longitude):.4f}".replace(".", ",")
        + f" {east_west}"
    )
