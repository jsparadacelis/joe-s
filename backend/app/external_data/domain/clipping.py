"""Clipping a ring to an axis-aligned rectangle in a metric plane (Sutherland-Hodgman).

The algorithm is exact for convex subjects. For a concave ring cut by the rectangle it can
leave zero-width bridges along the rectangle's border (the pieces stay connected): the area is
right and a renderer fills it correctly, which is all the relief view needs.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass

Point = tuple[float, float]

_MIN_CLOSED_RING = 4  # a triangle closed on its first position
_EMPTY_AREA_M2 = 1e-9


@dataclass(frozen=True)
class Rectangle:
    min_x: float
    min_y: float
    max_x: float
    max_y: float

    def __post_init__(self) -> None:
        if not (self.max_x > self.min_x and self.max_y > self.min_y):
            raise ValueError("A rectangle needs positive width and height")

    @property
    def width(self) -> float:
        return self.max_x - self.min_x

    @property
    def height(self) -> float:
        return self.max_y - self.min_y

    @property
    def centre(self) -> Point:
        return (self.min_x + self.max_x) / 2, (self.min_y + self.max_y) / 2

    def contains(self, point: Point) -> bool:
        return self.min_x <= point[0] <= self.max_x and self.min_y <= point[1] <= self.max_y


def ring_area(ring: Sequence[Point], *, signed: bool = False) -> float:
    """Shoelace area of a closed ring; the signed one is positive when counter-clockwise."""
    twice = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:], strict=False))
    return twice / 2 if signed else abs(twice) / 2


def _intersection_x(a: Point, b: Point, x: float) -> Point:
    return x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])


def _intersection_y(a: Point, b: Point, y: float) -> Point:
    return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y


def _clip_against(
    points: list[Point],
    inside: Callable[[Point], bool],
    cut: Callable[[Point, Point], Point],
) -> list[Point]:
    output: list[Point] = []
    for a, b in zip(points, points[1:] + points[:1], strict=True):
        a_in = inside(a)
        if a_in:
            output.append(a)
        if a_in != inside(b):
            output.append(cut(a, b))
    return output


def clip_ring_to_rectangle(ring: Sequence[Point], window: Rectangle) -> list[Point]:
    """The closed ring cut to the window, or `[]` when nothing with an area is left.

    `ring` is closed (first position repeated at the end). The orientation is kept and the
    input is not modified.
    """
    if len(ring) < _MIN_CLOSED_RING or ring[0] != ring[-1]:
        raise ValueError("A ring must be closed and have at least four positions")
    points = [(float(x), float(y)) for x, y in ring[:-1]]
    sides = (
        (lambda p: p[0] >= window.min_x, lambda a, b: _intersection_x(a, b, window.min_x)),
        (lambda p: p[0] <= window.max_x, lambda a, b: _intersection_x(a, b, window.max_x)),
        (lambda p: p[1] >= window.min_y, lambda a, b: _intersection_y(a, b, window.min_y)),
        (lambda p: p[1] <= window.max_y, lambda a, b: _intersection_y(a, b, window.max_y)),
    )
    for inside, cut in sides:
        points = _clip_against(points, inside, cut)
        if not points:
            return []
    closed = [*points, points[0]]
    return closed if ring_area(closed) > _EMPTY_AREA_M2 else []
