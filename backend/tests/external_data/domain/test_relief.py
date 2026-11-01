"""The relief of a plot: options, view window, requested grid, clipped outline, height grid.

Test plots are drawn in the UTM 30N plane around (500000, 4474000), the central meridian, so
metres in the expectations are plain differences of local coordinates.
"""

import math

import pytest

from backend.app.external_data.domain.plot import Plot, PlotGeometry, PlotPolygon
from backend.app.external_data.domain.relief import (
    CELL_SIZE_M,
    DEFAULT_MARGIN_M,
    DEFAULT_MAX_SIDE_M,
    MARGINS_M,
    MAX_CELLS_PER_SIDE,
    MAX_SIDES_M,
    ElevationGrid,
    InvalidReliefData,
    InvalidReliefOptions,
    Relief,
    ReliefOptions,
    plan_relief_window,
)
from backend.app.external_data.domain.utm import inverse_utm, project_utm
from backend.tests.external_data.domain.test_plot import REFERENCE

ORIGIN = (500000.0, 4474000.0)


def ring_from_metres(points):
    closed = [*points, points[0]]
    return tuple(inverse_utm(ORIGIN[0] + x, ORIGIN[1] + y, 30) for x, y in closed)


def rectangle(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def plot_of(*polygons):
    """Each polygon is `(exterior, [holes])` in local metres."""
    built = tuple(
        PlotPolygon(ring_from_metres(exterior), tuple(ring_from_metres(h) for h in holes))
        for exterior, holes in polygons
    )
    return Plot(REFERENCE, PlotGeometry(built), None)


def square_plot(x0, y0, x1, y1):
    return plot_of((rectangle(x0, y0, x1, y1), []))


def local(lon, lat):
    x, y = project_utm(lon, lat, 30)
    return x - ORIGIN[0], y - ORIGIN[1]


def options(margin=0, max_side=500):
    return ReliefOptions(margin, max_side)


# --- options -----------------------------------------------------------------------------------


def test_the_allowed_values_and_the_defaults():
    assert MARGINS_M == (0, 10, 25, 50, 100)
    assert MAX_SIDES_M == (100, 200, 300, 500)
    assert (DEFAULT_MARGIN_M, DEFAULT_MAX_SIDE_M) == (25, 300)
    assert ReliefOptions() == ReliefOptions(25, 300)


@pytest.mark.parametrize("margin", MARGINS_M)
@pytest.mark.parametrize("max_side", MAX_SIDES_M)
def test_every_allowed_combination_is_valid(margin, max_side):
    assert ReliefOptions(margin, max_side).margin_m == margin


@pytest.mark.parametrize("margin", [-10, 5, 30, 101, 1000])
def test_any_other_margin_is_rejected_in_spanish(margin):
    with pytest.raises(InvalidReliefOptions) as error:
        ReliefOptions(margin, 300)

    assert error.value.code == "invalid_relief_margin"
    assert error.value.message == "El margen debe ser 0, 10, 25, 50 o 100 metros."


@pytest.mark.parametrize("max_side", [0, 50, 250, 501, 1000])
def test_any_other_max_side_is_rejected_in_spanish(max_side):
    with pytest.raises(InvalidReliefOptions) as error:
        ReliefOptions(25, max_side)

    assert error.value.code == "invalid_relief_max_side"
    assert error.value.message == "El lado máximo debe ser 100, 200, 300 o 500 metros."


def test_a_boolean_is_not_a_valid_option():
    with pytest.raises(InvalidReliefOptions):
        ReliefOptions(True, 300)  # True == 1 in Python, but it is not 1 m


def test_the_cache_key_names_both_options():
    assert ReliefOptions(25, 300).cache_key == "m25-s300"
    assert ReliefOptions(0, 100).cache_key == "m0-s100"


# --- the view window ---------------------------------------------------------------------------


def test_the_window_is_the_plot_box_plus_the_margin_on_every_side():
    plan = plan_relief_window(square_plot(100, 200, 160, 240), options(margin=10, max_side=200))

    window = plan.window
    assert (window.width_m, window.height_m) == (80.0, 60.0)
    assert local(window.min_lon, window.min_lat) == pytest.approx((90, 190), abs=0.5)
    assert local(window.max_lon, window.max_lat) == pytest.approx((170, 250), abs=0.5)
    assert plan.clipped is False
    assert plan.parcel_clipped is False


def test_a_plot_that_fits_is_not_clipped_and_its_outline_is_the_whole_plot():
    plot = square_plot(0, 0, 60, 40)

    plan = plan_relief_window(plot, options(margin=25, max_side=300))

    whole = plot.geometry.polygons[0].exterior
    assert len(plan.outline.polygons[0].exterior) == len(whole)
    for clipped, original in zip(plan.outline.polygons[0].exterior, whole, strict=True):
        assert clipped == pytest.approx(original, abs=1e-7)


def test_the_window_covers_the_rectangle_in_metres_whatever_the_projection():
    window = plan_relief_window(square_plot(0, 0, 60, 40), options(margin=100, max_side=500)).window

    corners = [
        local(lon, lat)
        for lon in (window.min_lon, window.max_lon)
        for lat in (window.min_lat, window.max_lat)
    ]
    assert min(x for x, _ in corners) <= -100 + 0.01
    assert max(x for x, _ in corners) >= 160 - 0.01
    assert min(y for _, y in corners) <= -100 + 0.01
    assert max(y for _, y in corners) >= 140 - 0.01
    assert window.min_lon < window.max_lon and window.min_lat < window.max_lat


def test_a_nine_hectare_rural_plot_with_side_200_gives_a_200_by_200_clipped_window():
    """Acceptance criterion of RGB-33."""
    plot = square_plot(0, 0, 300, 300)  # 90 000 m2 = 9 ha
    assert plot.computed_area_m2 == pytest.approx(90000, rel=1e-3)

    plan = plan_relief_window(plot, options(margin=25, max_side=200))

    assert (plan.window.width_m, plan.window.height_m) == (200.0, 200.0)
    assert plan.clipped is True
    assert plan.parcel_clipped is True
    centre = local(
        (plan.window.min_lon + plan.window.max_lon) / 2,
        (plan.window.min_lat + plan.window.max_lat) / 2,
    )
    assert centre == pytest.approx((150, 150), abs=0.5)  # centred on the centroid


def test_only_the_side_that_exceeds_the_maximum_is_limited():
    plan = plan_relief_window(square_plot(0, 0, 400, 100), options(margin=0, max_side=300))

    assert (plan.window.width_m, plan.window.height_m) == (300.0, 100.0)
    assert plan.clipped is True
    assert plan.parcel_clipped is True


def test_the_margin_alone_can_exceed_the_side_without_cutting_the_plot():
    plan = plan_relief_window(square_plot(0, 0, 280, 100), options(margin=25, max_side=300))

    assert plan.window.width_m == 300.0  # 280 + 2 * 25 = 330 > 300
    assert plan.window.height_m == 150.0
    assert plan.clipped is True
    assert plan.parcel_clipped is False  # the plot (280 m) still fits in the 300 m window


def test_a_window_of_exactly_the_maximum_side_is_not_clipped():
    plan = plan_relief_window(square_plot(0, 0, 250, 100), options(margin=25, max_side=300))

    assert plan.window.width_m == 300.0
    assert plan.clipped is False


def test_the_clipped_outline_is_the_part_of_the_plot_inside_the_window():
    plan = plan_relief_window(square_plot(0, 0, 300, 300), options(margin=0, max_side=200))

    (polygon,) = plan.outline.polygons
    points = [local(lon, lat) for lon, lat in polygon.exterior]
    assert {(round(x), round(y)) for x, y in points} == {(50, 50), (250, 50), (250, 250), (50, 250)}


def test_a_plot_partly_outside_loses_only_the_outside_part():
    triangle = [(0, 0), (400, 0), (0, 100)]
    plan = plan_relief_window(plot_of((triangle, [])), options(margin=0, max_side=300))

    assert plan.window.width_m == 300.0
    assert plan.parcel_clipped is True
    xs = [local(lon, lat)[0] for lon, lat in plan.outline.polygons[0].exterior]
    # The window is centred on the centroid (x = 400 / 3): it ends at 400 / 3 + 150.
    assert max(xs) == pytest.approx(400 / 3 + 150, abs=0.5)
    assert min(xs) == pytest.approx(0, abs=0.5)  # the left side of the plot is inside


def test_a_hole_inside_the_window_is_kept():
    plot = plot_of((rectangle(0, 0, 100, 100), [rectangle(40, 40, 60, 60)]))

    plan = plan_relief_window(plot, options(margin=0, max_side=200))

    (polygon,) = plan.outline.polygons
    assert len(polygon.interiors) == 1
    assert plan.parcel_clipped is False


def test_a_hole_that_falls_outside_the_window_is_dropped():
    plot = plot_of((rectangle(0, 0, 400, 100), [rectangle(350, 40, 380, 60)]))

    plan = plan_relief_window(plot, options(margin=0, max_side=300))

    (polygon,) = plan.outline.polygons
    assert polygon.interiors == ()
    assert plan.parcel_clipped is True


def test_a_plot_with_no_part_inside_the_window_has_no_outline():
    far_apart = plot_of(
        (rectangle(0, 0, 10, 10), []),
        (rectangle(990, 0, 1000, 10), []),
    )

    plan = plan_relief_window(far_apart, options(margin=0, max_side=100))

    assert plan.outline is None
    assert plan.parcel_clipped is True


def test_a_multipart_plot_inside_the_window_keeps_every_part():
    plot = plot_of((rectangle(0, 0, 30, 30), []), (rectangle(60, 0, 90, 30), []))

    plan = plan_relief_window(plot, options(margin=10, max_side=200))

    assert len(plan.outline.polygons) == 2
    assert plan.parcel_clipped is False


# --- the requested grid ------------------------------------------------------------------------


def test_the_grid_asks_for_one_cell_per_five_metres_rounded_up():
    window = plan_relief_window(square_plot(0, 0, 202, 101), options()).window

    assert CELL_SIZE_M == 5
    assert window.grid_size == (41, 21)  # ceil(202 / 5), ceil(101 / 5)


def test_a_window_of_exact_multiples_of_five_has_no_extra_cell():
    window = plan_relief_window(square_plot(0, 0, 200, 100), options()).window

    assert window.grid_size == (40, 20)


def test_the_largest_window_is_capped_at_the_documented_limit():
    window = plan_relief_window(square_plot(0, 0, 900, 900), options(0, 500)).window

    assert MAX_CELLS_PER_SIDE == 100
    assert window.grid_size == (100, 100)


def test_a_tiny_window_still_asks_for_at_least_two_cells_per_side():
    window = plan_relief_window(square_plot(0, 0, 3, 3), options()).window

    assert window.grid_size == (2, 2)


# --- the height grid ---------------------------------------------------------------------------


def test_a_grid_knows_its_lowest_and_highest_point():
    grid = ElevationGrid(3, 2, (10.0, 12.5, 11.0, 9.0, 20.25, 15.0))

    assert (grid.ncols, grid.nrows) == (3, 2)
    assert (grid.min_m, grid.max_m) == (9.0, 20.25)


def test_cells_without_data_are_null_and_ignored_by_min_and_max():
    grid = ElevationGrid(2, 2, (None, 5.0, 7.0, None))

    assert grid.values == (None, 5.0, 7.0, None)
    assert (grid.min_m, grid.max_m) == (5.0, 7.0)


def test_a_grid_where_every_cell_lacks_data_is_refused():
    with pytest.raises(InvalidReliefData):
        ElevationGrid(2, 1, (None, None))


def test_the_number_of_values_must_match_the_size():
    with pytest.raises(InvalidReliefData):
        ElevationGrid(3, 2, (1.0, 2.0, 3.0))


@pytest.mark.parametrize("size", [(0, 2), (2, 0), (-1, 3), (1, 1)])
def test_a_grid_needs_at_least_two_columns_and_rows(size):
    with pytest.raises(InvalidReliefData):
        ElevationGrid(size[0], size[1], tuple(float(i) for i in range(max(size[0] * size[1], 0))))


@pytest.mark.parametrize("bad", [math.nan, math.inf, -math.inf])
def test_non_finite_heights_are_refused(bad):
    with pytest.raises(InvalidReliefData):
        ElevationGrid(2, 1, (1.0, bad))


# --- the relief --------------------------------------------------------------------------------


def a_relief(plot=None, max_side=200):
    plot = plot or square_plot(0, 0, 300, 300)
    plan = plan_relief_window(plot, options(margin=25, max_side=max_side))
    cols, rows = plan.window.grid_size
    values = tuple(float(i % 7) for i in range(cols * rows))
    return Relief(
        REFERENCE,
        plan.window,
        ElevationGrid(cols, rows, values),
        plan.outline,
        plan.clipped,
        plan.parcel_clipped,
        plot.computed_area_m2,
    )


def test_the_relief_serialises_to_the_documented_shape():
    data = a_relief().to_dict()

    assert list(data) == [
        "reference",
        "window",
        "grid",
        "outline",
        "clipped",
        "parcel_clipped",
        "plot_area_m2",
    ]
    assert list(data["window"]) == [
        "min_lon",
        "min_lat",
        "max_lon",
        "max_lat",
        "width_m",
        "height_m",
    ]
    assert list(data["grid"]) == ["ncols", "nrows", "cell_size_m", "values", "min_m", "max_m"]
    assert data["grid"]["cell_size_m"] == 5
    assert data["grid"]["ncols"] * data["grid"]["nrows"] == len(data["grid"]["values"])
    assert data["outline"]["type"] == "Polygon"
    assert data["clipped"] is True and data["parcel_clipped"] is True


def test_the_relief_survives_the_dictionary_round_trip():
    relief = a_relief()

    assert Relief.from_dict(relief.to_dict()) == relief


def test_a_relief_without_outline_round_trips():
    far_apart = plot_of((rectangle(0, 0, 10, 10), []), (rectangle(990, 0, 1000, 10), []))
    plan = plan_relief_window(far_apart, options(margin=0, max_side=100))
    cols, rows = plan.window.grid_size
    grid = ElevationGrid(cols, rows, tuple(float(i) for i in range(cols * rows)))
    relief = Relief(REFERENCE, plan.window, grid, None, True, True, 200.0)

    data = relief.to_dict()

    assert data["outline"] is None
    assert Relief.from_dict(data) == relief


def test_from_dict_recomputes_the_derived_values_and_drops_anything_else():
    data = a_relief().to_dict()
    data["grid"]["min_m"] = -999.0
    data["extra"] = "ignored"

    assert Relief.from_dict(data).grid.min_m == 0.0


def test_the_grid_must_match_the_requested_size_of_the_window():
    plan = plan_relief_window(square_plot(0, 0, 100, 100), options())

    with pytest.raises(InvalidReliefData):
        Relief(
            REFERENCE, plan.window, ElevationGrid(3, 3, tuple(range(9))), None, False, False, 1.0
        )


def test_a_relief_reference_has_fourteen_characters():
    plan = plan_relief_window(square_plot(0, 0, 100, 100), options())
    cols, rows = plan.window.grid_size

    with pytest.raises(InvalidReliefData):
        Relief(
            "SHORT",
            plan.window,
            ElevationGrid(cols, rows, tuple(float(i) for i in range(cols * rows))),
            None,
            False,
            False,
            1.0,
        )
