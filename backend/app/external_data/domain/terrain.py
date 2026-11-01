"""Altitude and slope of a plot, estimated from a handful of elevation samples.

The elevation service has a ~90 m grid: the slope of a small plot is therefore a coarse
estimate, always presented as such. The rule (from the PRD): take the two vertices farthest from
the centroid; the slope is the largest height difference between one of them and the centroid,
over the horizontal distance between the two points, in %.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from backend.app.external_data.domain.cadastral_reference import PLOT_LENGTH
from backend.app.external_data.domain.plot import Plot, Position

# Exactly the options of the `slopeType` technical datum (RGB-28 catalog).
SLOPE_CATEGORIES = (
    "Llana (< 3 %)",
    "Suave (3–10 %)",
    "Moderada (10–20 %)",
    "Pronunciada (20–35 %)",
    "Muy pronunciada (> 35 %)",
)
# Lower limit (inclusive) of every category but the first; "> 35" is strict, so 35 % itself is
# still "Pronunciada" and the last category starts above its limit.
_UPPER_LIMITS_PCT = (3.0, 10.0, 20.0)
STEEP_LIMIT_PCT = 35.0

FARTHEST_VERTICES = 2
SLOPE_DECIMALS = 1
ALTITUDE_DECIMALS = 1


class InvalidTerrainData(ValueError):
    """The elevations or the slope are not usable numbers."""


def slope_category(slope_pct: float) -> str:
    """The catalog category of a slope in %. Raises `ValueError` for a negative or non-finite
    slope."""
    if not math.isfinite(slope_pct) or slope_pct < 0:
        raise ValueError("A slope is a finite, non-negative percentage")
    for limit, category in zip(_UPPER_LIMITS_PCT, SLOPE_CATEGORIES, strict=False):
        if slope_pct < limit:
            return category
    return SLOPE_CATEGORIES[3] if slope_pct <= STEEP_LIMIT_PCT else SLOPE_CATEGORIES[4]


def estimate_slope_pct(
    centroid_elevation_m: float, samples: Sequence[tuple[float, float]]
) -> float | None:
    """`samples` are `(elevation_m, horizontal_distance_m)` of the farthest vertices, farthest
    first. The sample with the largest height difference to the centroid gives the slope (the
    first one on a tie); a sample at the centroid (no distance) says nothing and is skipped.
    `None` when no sample is left."""
    usable = [(abs(elevation - centroid_elevation_m), d) for elevation, d in samples if d > 0]
    if not usable:
        return None
    difference, distance = max(usable, key=lambda item: item[0])  # max keeps the first on a tie
    return round(difference / distance * 100, SLOPE_DECIMALS)


@dataclass(frozen=True)
class TerrainProfile:
    """What is known about the ground of a plot. `slope_pct` is `None` when it cannot be
    estimated. The category is derived, so it can never disagree with the slope."""

    reference: str  # the 14-character plot reference
    altitude_m: float
    slope_pct: float | None

    def __post_init__(self) -> None:
        if len(self.reference) != PLOT_LENGTH:
            raise InvalidTerrainData("A plot reference has 14 characters")
        if not math.isfinite(self.altitude_m):
            raise InvalidTerrainData("The altitude must be a finite number")
        if self.slope_pct is not None and (not math.isfinite(self.slope_pct) or self.slope_pct < 0):
            raise InvalidTerrainData("The slope must be a finite, non-negative number")

    @property
    def slope_category(self) -> str | None:
        return None if self.slope_pct is None else slope_category(self.slope_pct)

    def to_dict(self) -> dict[str, Any]:
        return {
            "altitude_m": self.altitude_m,
            "slope_pct": self.slope_pct,
            "slope_category": self.slope_category,
            "estimated": True,  # the elevation grid is ~90 m: never a surveyed value
        }

    @classmethod
    def from_dict(cls, reference: str, data: dict[str, Any]) -> TerrainProfile:
        """Read only the stored inputs: the category is recomputed, anything else dropped."""
        return cls(reference, float(data["altitude_m"]), _optional_float(data["slope_pct"]))


def _optional_float(value: Any) -> float | None:
    return None if value is None else float(value)


def sampling_positions(plot: Plot) -> tuple[Position, ...]:
    """Where to ask for elevations: the centroid, then the farthest vertices."""
    farthest = plot.farthest_vertices(FARTHEST_VERTICES)
    return (plot.centroid, *(position for position, _ in farthest))


def profile_from_elevations(plot: Plot, elevations: Sequence[float]) -> TerrainProfile:
    """`elevations` answer `sampling_positions(plot)`, in order."""
    farthest = plot.farthest_vertices(FARTHEST_VERTICES)
    if len(elevations) != 1 + len(farthest):
        raise ValueError("One elevation is needed for every sampling position")
    centroid_elevation, *vertex_elevations = elevations
    samples = [(h, distance) for h, (_, distance) in zip(vertex_elevations, farthest, strict=True)]
    return TerrainProfile(
        plot.reference,
        round(centroid_elevation, ALTITUDE_DECIMALS),
        estimate_slope_pct(centroid_elevation, samples),
    )
