"""The plot of a property: its outline (INSPIRE) and what is measured on it.

Rings hold `(lon, lat)` positions, the GeoJSON order, even though the service answers lat, lon.
Areas and lengths are metres in the UTM plane of the plot's zone, computed here in pure Python.
Like the geometry, the model has no ownership data: the plot is public cartography only.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from backend.app.external_data.domain.cadastral_reference import PLOT_LENGTH
from backend.app.external_data.domain.utm import UnsupportedZone, inverse_utm, project_utm, utm_zone

Position = tuple[float, float]  # (longitude, latitude)
Ring = tuple[Position, ...]

AREA_WARNING_PCT = 3.0
_MIN_RING_POSITIONS = 4  # a triangle closed on its first position


class InvalidPlotGeometry(ValueError):
    """The outline is not a usable polygon (not closed, out of range, no area...)."""


def _signed_area(ring: Ring) -> float:
    """Shoelace sum / 2: positive when the ring runs counter-clockwise."""
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:], strict=False)) / 2


def _validated_ring(ring: Any) -> Ring:
    positions = tuple((float(lon), float(lat)) for lon, lat in ring)
    if len(positions) < _MIN_RING_POSITIONS:
        raise InvalidPlotGeometry("A ring needs at least four positions")
    if positions[0] != positions[-1]:
        raise InvalidPlotGeometry("A ring must be closed")
    for lon, lat in positions:
        if not (math.isfinite(lon) and math.isfinite(lat)):
            raise InvalidPlotGeometry("Positions must be finite numbers")
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise InvalidPlotGeometry("Position outside longitude/latitude range")
    if _signed_area(positions) == 0:
        raise InvalidPlotGeometry("A ring must enclose an area")
    return positions


def _oriented(ring: Ring, *, counter_clockwise: bool) -> list[list[float]]:
    ordered = ring if (_signed_area(ring) > 0) == counter_clockwise else tuple(reversed(ring))
    return [[lon, lat] for lon, lat in ordered]


@dataclass(frozen=True)
class PlotPolygon:
    exterior: Ring
    interiors: tuple[Ring, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "exterior", _validated_ring(self.exterior))
        object.__setattr__(
            self, "interiors", tuple(_validated_ring(ring) for ring in self.interiors)
        )

    def to_geojson_rings(self) -> list[list[list[float]]]:
        """Exterior counter-clockwise, holes clockwise (RFC 7946)."""
        return [_oriented(self.exterior, counter_clockwise=True)] + [
            _oriented(ring, counter_clockwise=False) for ring in self.interiors
        ]

    @classmethod
    def from_geojson_rings(cls, rings: list) -> PlotPolygon:
        if not rings:
            raise InvalidPlotGeometry("A polygon needs an exterior ring")
        return cls(tuple(map(tuple, rings[0])), tuple(tuple(map(tuple, r)) for r in rings[1:]))


@dataclass(frozen=True)
class PlotGeometry:
    polygons: tuple[PlotPolygon, ...]

    def __post_init__(self) -> None:
        if not self.polygons:
            raise InvalidPlotGeometry("A plot needs at least one polygon")

    def to_geojson(self) -> dict[str, Any]:
        if len(self.polygons) == 1:
            return {"type": "Polygon", "coordinates": self.polygons[0].to_geojson_rings()}
        return {
            "type": "MultiPolygon",
            "coordinates": [polygon.to_geojson_rings() for polygon in self.polygons],
        }

    @classmethod
    def from_geojson(cls, data: dict[str, Any]) -> PlotGeometry:
        kind = data.get("type")
        if kind == "Polygon":
            return cls((PlotPolygon.from_geojson_rings(data["coordinates"]),))
        if kind == "MultiPolygon":
            return cls(tuple(PlotPolygon.from_geojson_rings(r) for r in data["coordinates"]))
        raise InvalidPlotGeometry(f"Unsupported geometry type: {kind!r}")


def _planar_area(points: list[tuple[float, float]]) -> float:
    return _signed_area(tuple(points))


@dataclass(frozen=True)
class Plot:
    """`cadastral_area_m2` is the official surface (`areaValue`); the rest is derived."""

    reference: str  # the 14-character plot reference
    geometry: PlotGeometry
    cadastral_area_m2: int | None

    def __post_init__(self) -> None:
        if len(self.reference) != PLOT_LENGTH:
            raise InvalidPlotGeometry("A plot reference has 14 characters")
        if self.cadastral_area_m2 is not None and self.cadastral_area_m2 < 0:
            raise InvalidPlotGeometry("The cadastral area cannot be negative")
        self._zone()  # fails now, not on first use, if the plot cannot be measured

    # -- projection ------------------------------------------------------------------------

    @property
    def utm_zone(self) -> int:
        """The UTM zone (28-31) of the plot's centre, the plane every measurement uses."""
        return self._zone()

    def _zone(self) -> int:
        lons = [lon for polygon in self.geometry.polygons for lon, _ in polygon.exterior]
        try:
            return utm_zone((min(lons) + max(lons)) / 2)
        except UnsupportedZone as error:
            raise InvalidPlotGeometry(str(error)) from error

    def _origin(self) -> tuple[float, float]:
        lon, lat = self.geometry.polygons[0].exterior[0]
        return project_utm(lon, lat, self._zone())

    def _projected(self, ring: Ring) -> list[tuple[float, float]]:
        """Metres east/north of the first vertex: small numbers keep the shoelace sums exact
        (raw UTM northings near 4.5e6 would lose centimetres in the products)."""
        zone = self._zone()
        ox, oy = self._origin()
        return [(x - ox, y - oy) for x, y in (project_utm(lon, lat, zone) for lon, lat in ring)]

    # -- measurements ----------------------------------------------------------------------

    @property
    def computed_area_m2(self) -> float:
        total = 0.0
        for polygon in self.geometry.polygons:
            total += abs(_planar_area(self._projected(polygon.exterior)))
            total -= sum(abs(_planar_area(self._projected(r))) for r in polygon.interiors)
        return round(total, 2)

    @property
    def boundary_lengths_m(self) -> list[float]:
        """Segment lengths: each polygon's exterior ring, then its holes."""
        lengths: list[float] = []
        for polygon in self.geometry.polygons:
            for ring in (polygon.exterior, *polygon.interiors):
                points = self._projected(ring)
                lengths += [
                    round(math.dist(a, b), 2) for a, b in zip(points, points[1:], strict=False)
                ]
        return lengths

    @property
    def centroid(self) -> Position:
        """Area-weighted centroid (holes subtract), as (lon, lat)."""
        zone = self._zone()
        area = cx = cy = 0.0
        for polygon in self.geometry.polygons:
            for ring, sign in [(polygon.exterior, 1)] + [(r, -1) for r in polygon.interiors]:
                points = self._projected(ring)
                ring_area = abs(_planar_area(points))
                sx = sy = 0.0
                for (x1, y1), (x2, y2) in zip(points, points[1:], strict=False):
                    cross = x1 * y2 - x2 * y1
                    sx += (x1 + x2) * cross
                    sy += (y1 + y2) * cross
                twice_signed = 2 * _planar_area(points)
                ring_cx, ring_cy = sx / (3 * twice_signed), sy / (3 * twice_signed)
                area += sign * ring_area
                cx += sign * ring_area * ring_cx
                cy += sign * ring_area * ring_cy
        ox, oy = self._origin()
        lon, lat = inverse_utm(ox + cx / area, oy + cy / area, zone)
        return round(lon, 8), round(lat, 8)

    @property
    def vertices(self) -> tuple[Position, ...]:
        """The exterior positions of every polygon, without each ring's closing repeat."""
        return tuple(
            position for polygon in self.geometry.polygons for position in polygon.exterior[:-1]
        )

    def horizontal_distance_m(self, a: Position, b: Position) -> float:
        """Straight-line distance in the UTM plane of the plot, in metres (2 decimals)."""
        zone = self._zone()
        return round(math.dist(project_utm(*a, zone), project_utm(*b, zone)), 2)

    def farthest_vertices(self, count: int) -> tuple[tuple[Position, float], ...]:
        """The `count` vertices farthest from the centroid with their distance in metres, the
        farthest first. A vertex repeated in the outline counts once; vertices as far as each
        other (to the centimetre) keep their order in the outline."""
        centroid = self.centroid
        unique = dict.fromkeys(self.vertices)
        ranked = sorted(
            ((vertex, self.horizontal_distance_m(centroid, vertex)) for vertex in unique),
            key=lambda item: -item[1],
        )
        return tuple(ranked[:count])

    # -- comparison with the official area ---------------------------------------------------

    @property
    def difference_pct(self) -> float | None:
        """(computed - official) / official, in %; `None` when there is no official area."""
        if not self.cadastral_area_m2:
            return None
        return round(
            (self.computed_area_m2 - self.cadastral_area_m2) / self.cadastral_area_m2 * 100, 2
        )

    @property
    def area_warning(self) -> bool:
        difference = self.difference_pct
        return difference is not None and abs(difference) > AREA_WARNING_PCT

    # -- serialisation ---------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        return {
            "reference": self.reference,
            "geometry": self.geometry.to_geojson(),
            "computed_area_m2": self.computed_area_m2,
            "cadastral_area_m2": self.cadastral_area_m2,
            "difference_pct": self.difference_pct,
            "area_warning": self.area_warning,
            "boundary_lengths_m": self.boundary_lengths_m,
            "centroid": list(self.centroid),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Plot:
        """Read only the stored inputs: derived values are recomputed, anything else dropped."""
        return cls(
            reference=data["reference"],
            geometry=PlotGeometry.from_geojson(data["geometry"]),
            cadastral_area_m2=data["cadastral_area_m2"],
        )
