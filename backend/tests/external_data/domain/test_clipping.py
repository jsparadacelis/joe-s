"""Clipping a ring to an axis-aligned rectangle (Sutherland-Hodgman), in a metric plane."""

import pytest

from backend.app.external_data.domain.clipping import (
    Rectangle,
    clip_ring_to_rectangle,
    ring_area,
)

WINDOW = Rectangle(0.0, 0.0, 100.0, 100.0)


def square(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]


def test_a_rectangle_knows_its_size_and_centre():
    rectangle = Rectangle(10.0, 20.0, 40.0, 100.0)

    assert (rectangle.width, rectangle.height) == (30.0, 80.0)
    assert rectangle.centre == (25.0, 60.0)


def test_a_rectangle_must_have_positive_sides():
    with pytest.raises(ValueError):
        Rectangle(0.0, 0.0, 0.0, 10.0)


def test_a_ring_inside_the_window_is_returned_unchanged():
    ring = square(10, 10, 60, 40)

    assert clip_ring_to_rectangle(ring, WINDOW) == ring


def test_a_ring_inside_the_window_keeps_its_starting_vertex_whatever_its_length():
    ring = [(10, 10), (60, 10), (30, 40), (10, 10)]

    assert clip_ring_to_rectangle(ring, WINDOW) == ring


def test_a_ring_that_crosses_one_side_is_cut_at_that_side():
    clipped = clip_ring_to_rectangle(square(50, 20, 150, 60), WINDOW)

    assert ring_area(clipped) == pytest.approx(50 * 40)
    assert max(x for x, _ in clipped) == 100.0
    assert clipped[0] == clipped[-1]


def test_a_ring_that_crosses_a_corner_loses_the_corner():
    clipped = clip_ring_to_rectangle(square(50, 50, 150, 150), WINDOW)

    assert ring_area(clipped) == pytest.approx(50 * 50)


def test_a_ring_that_contains_the_window_becomes_the_window():
    clipped = clip_ring_to_rectangle(square(-500, -500, 500, 500), WINDOW)

    assert ring_area(clipped) == pytest.approx(100 * 100)
    assert set(clipped) == {(0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (0.0, 100.0)}


def test_a_ring_entirely_outside_the_window_is_empty():
    assert clip_ring_to_rectangle(square(200, 200, 300, 300), WINDOW) == []


def test_a_ring_that_only_touches_the_window_at_an_edge_is_empty():
    assert clip_ring_to_rectangle(square(100, 0, 200, 100), WINDOW) == []


def test_the_orientation_of_the_ring_is_kept():
    ccw = square(50, 20, 150, 60)
    cw = list(reversed(ccw))

    assert ring_area(clip_ring_to_rectangle(ccw, WINDOW), signed=True) > 0
    assert ring_area(clip_ring_to_rectangle(cw, WINDOW), signed=True) < 0


def test_a_triangle_cut_by_the_window_has_the_expected_area():
    triangle = [(-50.0, 0.0), (50.0, 0.0), (-50.0, 100.0), (-50.0, 0.0)]  # right angle at (-50, 0)

    clipped = clip_ring_to_rectangle(triangle, WINDOW)

    # The part with x >= 0 is a right triangle: height 50 at x=0, none at x=50.
    assert ring_area(clipped) == pytest.approx(50 * 50 / 2)


def test_the_input_is_not_modified():
    ring = square(50, 20, 150, 60)
    before = list(ring)

    clip_ring_to_rectangle(ring, WINDOW)

    assert ring == before


def test_an_open_or_tiny_ring_is_refused():
    with pytest.raises(ValueError):
        clip_ring_to_rectangle([(0, 0), (1, 0), (1, 1)], WINDOW)
