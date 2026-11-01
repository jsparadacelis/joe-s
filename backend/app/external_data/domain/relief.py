"""The relief around a plot: a view window, the height grid inside it, the clipped outline.

The window is the plot's box plus a margin; when a side exceeds the maximum side it is centred
on the plot's centroid with that side, and the result is flagged as `clipped`. All distances
are metres in the UTM plane of the plot (the one RGB-25 measures in); the window is converted
back to degrees (EPSG:4258 is WGS84 for this purpose) to ask the elevation service for it.

Grid values are heights in metres, row-major, the first row being the northernmost (the order
of an ASCII grid), `None` where the model has no data.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from backend.app.external_data.domain.cadastral_reference import PLOT_LENGTH
from backend.app.external_data.domain.clipping import Rectangle, clip_ring_to_rectangle, ring_area
from backend.app.external_data.domain.plot import Plot, PlotGeometry, PlotPolygon
from backend.app.external_data.domain.utm import inverse_utm, project_utm

MARGINS_M = (0, 10, 25, 50, 100)
MAX_SIDES_M = (100, 200, 300, 500)
DEFAULT_MARGIN_M = 25
DEFAULT_MAX_SIDE_M = 300

CELL_SIZE_M = 5  # the native resolution of the IGN's MDT
# Safety cap on cells per side. The largest window (500 m) needs exactly 100, so the cap only
# matters if the allowed sides ever grow: it keeps a response under 10 000 values.
MAX_CELLS_PER_SIDE = 100
MIN_CELLS_PER_SIDE = 2

_DEGREE_DECIMALS = 8  # about a millimetre
_METRE_DECIMALS = 2
_NEGLIGIBLE_RING_M2 = 0.01


class InvalidReliefOptions(ValueError):
    """The margin or the maximum side is not one of the allowed values."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


class InvalidReliefData(ValueError):
    """The height grid or the relief built from it is not usable."""


def _is_allowed(value: Any, allowed: tuple[int, ...]) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value in allowed


@dataclass(frozen=True)
class ReliefOptions:
    margin_m: int = DEFAULT_MARGIN_M
    max_side_m: int = DEFAULT_MAX_SIDE_M

    def __post_init__(self) -> None:
        if not _is_allowed(self.margin_m, MARGINS_M):
            raise InvalidReliefOptions(
                "invalid_relief_margin", "El margen debe ser 0, 10, 25, 50 o 100 metros."
            )
        if not _is_allowed(self.max_side_m, MAX_SIDES_M):
            raise InvalidReliefOptions(
                "invalid_relief_max_side", "El lado máximo debe ser 100, 200, 300 o 500 metros."
            )

    @property
    def cache_key(self) -> str:
        """Names the window these options give a plot (the cache is keyed by plot and options)."""
        return f"m{self.margin_m}-s{self.max_side_m}"


@dataclass(frozen=True)
class ReliefWindow:
    """Degrees (the box asked of the elevation service) and the size in metres it stands for."""

    min_lon: float
    min_lat: float
    max_lon: float
    max_lat: float
    width_m: float
    height_m: float

    def __post_init__(self) -> None:
        if not (self.min_lon < self.max_lon and self.min_lat < self.max_lat):
            raise InvalidReliefData("A window needs a positive extent")
        if not (self.width_m > 0 and self.height_m > 0):
            raise InvalidReliefData("A window needs a positive size in metres")

    @property
    def grid_size(self) -> tuple[int, int]:
        """(columns, rows) to ask for: one cell per 5 m, rounded up, within the cap."""

        def cells(length_m: float) -> int:
            wanted = math.ceil(round(length_m, _METRE_DECIMALS) / CELL_SIZE_M)
            return max(MIN_CELLS_PER_SIDE, min(MAX_CELLS_PER_SIDE, wanted))

        return cells(self.width_m), cells(self.height_m)

    def to_dict(self) -> dict[str, float]:
        return {
            "min_lon": self.min_lon,
            "min_lat": self.min_lat,
            "max_lon": self.max_lon,
            "max_lat": self.max_lat,
            "width_m": self.width_m,
            "height_m": self.height_m,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ReliefWindow:
        return cls(*(float(data[key]) for key in _WINDOW_KEYS))


_WINDOW_KEYS = ("min_lon", "min_lat", "max_lon", "max_lat", "width_m", "height_m")


@dataclass(frozen=True)
class WindowPlan:
    """Where to look (`window`) and what is known without any elevation: the outline cut to the
    window (`None` when no part of the plot is inside), whether the window had to be limited to
    the maximum side (`clipped`) and whether that left part of the plot outside
    (`parcel_clipped`)."""

    window: ReliefWindow
    outline: PlotGeometry | None
    clipped: bool
    parcel_clipped: bool


def _axis(lowest: float, highest: float, centre: float, options: ReliefOptions):
    """(min, max, clipped) along one axis: the box plus the margin, or the maximum side
    centred on the centroid when the box is longer."""
    span = round(highest - lowest + 2 * options.margin_m, _METRE_DECIMALS)
    if span <= options.max_side_m:
        return lowest - options.margin_m, highest + options.margin_m, False
    half = options.max_side_m / 2
    return centre - half, centre + half, True


def _to_degrees(point: tuple[float, float], zone: int) -> tuple[float, float]:
    lon, lat = inverse_utm(point[0], point[1], zone)
    return round(lon, _DEGREE_DECIMALS), round(lat, _DEGREE_DECIMALS)


def _clipped_outline(plot: Plot, rectangle: Rectangle) -> PlotGeometry | None:
    zone = plot.utm_zone

    def clip(ring: Sequence[tuple[float, float]]) -> tuple[tuple[float, float], ...] | None:
        projected = [project_utm(lon, lat, zone) for lon, lat in ring]
        clipped = clip_ring_to_rectangle(projected, rectangle)
        if not clipped or ring_area(clipped) < _NEGLIGIBLE_RING_M2:
            return None
        return tuple(_to_degrees(point, zone) for point in clipped)

    polygons = []
    for polygon in plot.geometry.polygons:
        exterior = clip(polygon.exterior)
        if exterior is None:
            continue
        holes = tuple(hole for hole in map(clip, polygon.interiors) if hole is not None)
        polygons.append(PlotPolygon(exterior, holes))
    return PlotGeometry(tuple(polygons)) if polygons else None


def plan_relief_window(plot: Plot, options: ReliefOptions) -> WindowPlan:
    zone = plot.utm_zone
    vertices = [project_utm(lon, lat, zone) for lon, lat in plot.vertices]
    xs, ys = [x for x, _ in vertices], [y for _, y in vertices]
    centre_x, centre_y = project_utm(*plot.centroid, zone)
    min_x, max_x, limited_x = _axis(min(xs), max(xs), centre_x, options)
    min_y, max_y, limited_y = _axis(min(ys), max(ys), centre_y, options)
    rectangle = Rectangle(min_x, min_y, max_x, max_y)

    corners = [_to_degrees(corner, zone) for corner in _corners(rectangle)]
    lons, lats = [c[0] for c in corners], [c[1] for c in corners]
    window = ReliefWindow(
        min(lons),
        min(lats),
        max(lons),
        max(lats),
        round(rectangle.width, _METRE_DECIMALS),
        round(rectangle.height, _METRE_DECIMALS),
    )
    return WindowPlan(
        window,
        _clipped_outline(plot, rectangle),
        clipped=limited_x or limited_y,
        parcel_clipped=not all(rectangle.contains(vertex) for vertex in vertices),
    )


def _corners(rectangle: Rectangle) -> list[tuple[float, float]]:
    return [
        (rectangle.min_x, rectangle.min_y),
        (rectangle.max_x, rectangle.min_y),
        (rectangle.max_x, rectangle.max_y),
        (rectangle.min_x, rectangle.max_y),
    ]


@dataclass(frozen=True)
class ElevationGrid:
    """`values` has `nrows` rows of `ncols` heights, north to south, west to east."""

    ncols: int
    nrows: int
    values: tuple[float | None, ...]

    def __post_init__(self) -> None:
        if self.ncols < MIN_CELLS_PER_SIDE or self.nrows < MIN_CELLS_PER_SIDE:
            raise InvalidReliefData("A grid needs at least two columns and two rows")
        if len(self.values) != self.ncols * self.nrows:
            raise InvalidReliefData("The number of heights does not match the grid size")
        cleaned = tuple(None if v is None else float(v) for v in self.values)
        if any(v is not None and not math.isfinite(v) for v in cleaned):
            raise InvalidReliefData("Heights must be finite numbers")
        if all(v is None for v in cleaned):
            raise InvalidReliefData("The grid has no height at all")
        object.__setattr__(self, "values", cleaned)

    @property
    def _known(self) -> list[float]:
        return [v for v in self.values if v is not None]

    @property
    def min_m(self) -> float:
        return min(self._known)

    @property
    def max_m(self) -> float:
        return max(self._known)

    def to_dict(self) -> dict[str, Any]:
        return {
            "ncols": self.ncols,
            "nrows": self.nrows,
            "cell_size_m": CELL_SIZE_M,
            "values": list(self.values),
            "min_m": self.min_m,
            "max_m": self.max_m,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ElevationGrid:
        """Read only the stored inputs: `min_m`, `max_m` and the cell size are derived."""
        return cls(int(data["ncols"]), int(data["nrows"]), tuple(data["values"]))


@dataclass(frozen=True)
class Relief:
    reference: str  # the 14-character plot reference
    window: ReliefWindow
    grid: ElevationGrid
    outline: PlotGeometry | None
    clipped: bool
    parcel_clipped: bool
    plot_area_m2: float  # of the whole plot, not only of the part inside the window

    def __post_init__(self) -> None:
        if len(self.reference) != PLOT_LENGTH:
            raise InvalidReliefData("A plot reference has 14 characters")
        if (self.grid.ncols, self.grid.nrows) != self.window.grid_size:
            raise InvalidReliefData("The grid does not have the size asked for the window")
        if not math.isfinite(self.plot_area_m2) or self.plot_area_m2 < 0:
            raise InvalidReliefData("The plot area must be a finite, non-negative number")

    def to_dict(self) -> dict[str, Any]:
        return {
            "reference": self.reference,
            "window": self.window.to_dict(),
            "grid": self.grid.to_dict(),
            "outline": None if self.outline is None else self.outline.to_geojson(),
            "clipped": self.clipped,
            "parcel_clipped": self.parcel_clipped,
            "plot_area_m2": self.plot_area_m2,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Relief:
        outline = data["outline"]
        return cls(
            reference=data["reference"],
            window=ReliefWindow.from_dict(data["window"]),
            grid=ElevationGrid.from_dict(data["grid"]),
            outline=None if outline is None else PlotGeometry.from_geojson(outline),
            clipped=bool(data["clipped"]),
            parcel_clipped=bool(data["parcel_clipped"]),
            plot_area_m2=float(data["plot_area_m2"]),
        )
