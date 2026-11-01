"""Buildable capacity of a property, from its technical data (RGB-30).

Pure and exact: numbers are `Decimal` and nothing is rounded here (the screen formats on
display). The rule is the one the front has shown since RGB-29 (`frontend/lib/capacity.ts`);
`capacity_cases.json` is run by both sides so they cannot drift.

Not in this version (v1.1): the buildable envelope with the most restrictive setback.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal
from enum import Enum

_PLAIN_NUMBER = re.compile(r"[0-9]+(?:[.,][0-9]+)?")
_FLOORS = {"PB": 1, "PB+1": 2, "PB+2": 3, "PB+3": 4, "PB+4": 5, "PB+5": 6}
_ONE_HUNDRED = Decimal(100)

CADASTRAL_AREA = "cadastralPlotArea"
POLYGON_AREA = "polygonPlotArea"
BUILDABILITY = "buildability"
MAX_OCCUPANCY = "maxOccupancy"
FLOORS = "floors"


class LimitingCondition(Enum):
    BUILDABILITY = "buildability"
    OCCUPANCY_FLOORS = "occupancy-floors"


@dataclass(frozen=True)
class Capacity:
    surface: Decimal
    buildable_area: Decimal  # ceiling by buildability
    footprint: Decimal  # maximum footprint by occupancy
    by_floors: Decimal  # footprint x number of floors
    maximum: Decimal
    limited_by: LimitingCondition
    existing: Decimal | None
    existing_share: Decimal | None  # % of the maximum ceiling already built; None if unknown
    min_plot: Decimal | None
    meets_min_plot: bool | None


@dataclass(frozen=True)
class CapacityResult:
    """The capacity, or (never both) the data that are missing to compute it."""

    capacity: Capacity | None
    missing: tuple[str, ...] = ()


def parse_number(raw: str | None) -> Decimal | None:
    """«1,5» or «1.5» becomes 1.5. Only plain non-negative decimals; anything else is None."""
    if not isinstance(raw, str):
        return None
    text = raw.strip()
    if _PLAIN_NUMBER.fullmatch(text) is None:
        return None
    return Decimal(text.replace(",", "."))


def compute_capacity(values: Mapping[str, str]) -> CapacityResult:
    """`values` maps a technical datum id to its stored text. Calculation surface: the polygon
    one for calcArea «Polígono», otherwise the cadastral one (there is no survey datum yet, so
    «Topográfico» falls back to it too)."""
    surface_id = POLYGON_AREA if values.get("calcArea") == "Polígono" else CADASTRAL_AREA
    surface = parse_number(values.get(surface_id))
    buildability = parse_number(values.get(BUILDABILITY))
    occupancy = parse_number(values.get(MAX_OCCUPANCY))
    floors = _FLOORS.get(values.get(FLOORS) or "")

    missing = tuple(
        field_id
        for field_id, present in (
            (surface_id, surface is not None),
            (BUILDABILITY, buildability is not None),
            (MAX_OCCUPANCY, occupancy is not None),
            (FLOORS, floors is not None),
        )
        if not present
    )
    if missing:
        return CapacityResult(None, missing)
    assert surface is not None and buildability is not None
    assert occupancy is not None and floors is not None

    buildable_area = surface * buildability
    footprint = surface * occupancy / _ONE_HUNDRED
    by_floors = footprint * floors
    maximum = min(buildable_area, by_floors)
    existing = parse_number(values.get("builtArea"))
    min_plot = parse_number(values.get("minPlot"))
    return CapacityResult(
        Capacity(
            surface=surface,
            buildable_area=buildable_area,
            footprint=footprint,
            by_floors=by_floors,
            maximum=maximum,
            # A tie is attributed to buildability.
            limited_by=(
                LimitingCondition.BUILDABILITY
                if buildable_area <= by_floors
                else LimitingCondition.OCCUPANCY_FLOORS
            ),
            existing=existing,
            existing_share=(
                existing / maximum * _ONE_HUNDRED if existing is not None and maximum > 0 else None
            ),
            min_plot=min_plot,
            meets_min_plot=None if min_plot is None else surface >= min_plot,
        )
    )
