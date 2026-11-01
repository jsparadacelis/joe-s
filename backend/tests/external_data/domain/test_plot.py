"""The plot model: GeoJSON, validation, measurements and the cadastral area comparison.

Test squares are 100 m / 20 m / 50 m sides drawn in the UTM 30N plane (440000, 4474000) and
converted to lon/lat once with pyproj outside the repo, so areas, lengths and centroids have
independent expected values.
"""

import dataclasses

import pytest

from backend.app.external_data.domain.plot import (
    AREA_WARNING_PCT,
    InvalidPlotGeometry,
    Plot,
    PlotGeometry,
    PlotPolygon,
)

REFERENCE = "4714805BC6841S"
PROPERTY_REFERENCE = REFERENCE + "0001FY"  # the 20-character reference of the test plot

# Closed rings of (lon, lat), counter-clockwise.
OUTER = (
    (-3.707199123, 40.414460493),
    (-3.706020543, 40.414467696),
    (-3.706029959, 40.415368543),
    (-3.707208555, 40.415361339),
    (-3.707199123, 40.414460493),
)
HOLE = (  # also counter-clockwise on purpose: the GeoJSON writer must flip it
    (-3.706731461, 40.414823714),
    (-3.706495744, 40.414825155),
    (-3.706497629, 40.415005324),
    (-3.706733347, 40.415003883),
    (-3.706731461, 40.414823714),
)
SECOND = (
    (-3.703663381, 40.414482066),
    (-3.703074091, 40.414485651),
    (-3.703078779, 40.414936074),
    (-3.703668074, 40.414932489),
    (-3.703663381, 40.414482066),
)


def square_geometry() -> PlotGeometry:
    return PlotGeometry((PlotPolygon(OUTER),))


def a_plot(geometry=None, cadastral_area_m2=10000, reference=REFERENCE) -> Plot:
    return Plot(reference, geometry or square_geometry(), cadastral_area_m2)


def clockwise(ring):
    return tuple(reversed(ring))


# --- validation -------------------------------------------------------------------------------


def test_a_ring_needs_at_least_four_positions():
    with pytest.raises(InvalidPlotGeometry):
        PlotPolygon(OUTER[:2] + OUTER[-1:])


def test_a_ring_must_be_closed():
    with pytest.raises(InvalidPlotGeometry):
        PlotPolygon(OUTER[:-1] + ((-3.7, 40.4),))


@pytest.mark.parametrize(
    "bad",
    [(float("nan"), 40.0), (-3.7, float("inf")), (-181.0, 40.0), (-3.7, 91.0)],
)
def test_positions_must_be_finite_and_inside_the_globe(bad):
    ring = (bad, (-3.7, 40.1), (-3.6, 40.1), bad)

    with pytest.raises(InvalidPlotGeometry):
        PlotPolygon(ring)


def test_a_plot_geometry_needs_at_least_one_polygon():
    with pytest.raises(InvalidPlotGeometry):
        PlotGeometry(())


def test_a_degenerate_ring_without_area_is_rejected():
    flat = ((-3.7, 40.4), (-3.6, 40.4), (-3.5, 40.4), (-3.7, 40.4))

    with pytest.raises(InvalidPlotGeometry):
        PlotPolygon(flat)


def test_a_plot_reference_has_fourteen_characters():
    with pytest.raises(InvalidPlotGeometry):
        a_plot(reference="4714805BC6841S0001FY")


def test_a_negative_cadastral_area_is_rejected():
    with pytest.raises(InvalidPlotGeometry):
        a_plot(cadastral_area_m2=-1)


# --- GeoJSON ----------------------------------------------------------------------------------


def test_one_polygon_is_a_geojson_polygon_in_lon_lat_order():
    geojson = square_geometry().to_geojson()

    assert geojson["type"] == "Polygon"
    assert geojson["coordinates"] == [[list(p) for p in OUTER]]
    assert geojson["coordinates"][0][0] == [-3.707199123, 40.414460493]  # lon first


def test_several_polygons_are_a_multipolygon():
    geometry = PlotGeometry((PlotPolygon(OUTER), PlotPolygon(SECOND)))

    geojson = geometry.to_geojson()

    assert geojson["type"] == "MultiPolygon"
    assert len(geojson["coordinates"]) == 2


def test_geojson_rings_follow_the_right_hand_rule_whatever_the_input_order():
    geometry = PlotGeometry((PlotPolygon(clockwise(OUTER), (HOLE,)),))

    exterior, hole = geometry.to_geojson()["coordinates"]

    assert _signed_area(exterior) > 0  # counter-clockwise
    assert _signed_area(hole) < 0  # clockwise
    assert exterior[0] == exterior[-1] and hole[0] == hole[-1]


def test_the_geojson_round_trip_keeps_the_geometry():
    geometry = PlotGeometry((PlotPolygon(OUTER, (clockwise(HOLE),)), PlotPolygon(SECOND)))

    assert PlotGeometry.from_geojson(geometry.to_geojson()) == geometry


def test_from_geojson_rejects_other_types():
    with pytest.raises(InvalidPlotGeometry):
        PlotGeometry.from_geojson({"type": "Point", "coordinates": [0, 0]})


def _signed_area(ring):
    return sum(
        ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1] for i in range(len(ring) - 1)
    )


# --- measurements -----------------------------------------------------------------------------


def test_the_area_of_a_100_m_square_is_ten_thousand_square_metres():
    assert a_plot().computed_area_m2 == pytest.approx(10000.0, abs=0.1)


def test_a_hole_is_subtracted_from_the_area():
    plot = a_plot(PlotGeometry((PlotPolygon(OUTER, (HOLE,)),)))

    assert plot.computed_area_m2 == pytest.approx(9600.0, abs=0.1)


def test_the_areas_of_several_polygons_add_up():
    plot = a_plot(PlotGeometry((PlotPolygon(OUTER), PlotPolygon(SECOND))))

    assert plot.computed_area_m2 == pytest.approx(12500.0, abs=0.1)


def test_the_area_does_not_depend_on_the_ring_direction():
    assert a_plot(PlotGeometry((PlotPolygon(clockwise(OUTER)),))).computed_area_m2 == pytest.approx(
        10000.0, abs=0.1
    )


def test_boundary_lengths_are_metres_per_segment():
    assert a_plot().boundary_lengths_m == pytest.approx([100.0] * 4, abs=0.01)


def test_boundary_lengths_include_the_segments_of_holes_after_the_exterior():
    plot = a_plot(PlotGeometry((PlotPolygon(OUTER, (HOLE,)),)))

    assert plot.boundary_lengths_m == pytest.approx([100.0] * 4 + [20.0] * 4, abs=0.01)


def test_the_centroid_is_lon_lat_of_the_square_centre():
    lon, lat = a_plot().centroid

    assert lon == pytest.approx(-3.706614545215196, abs=1e-7)
    assert lat == pytest.approx(40.41491451913097, abs=1e-7)


def test_the_centroid_of_several_polygons_is_weighted_by_area():
    lon, lat = a_plot(PlotGeometry((PlotPolygon(OUTER), PlotPolygon(SECOND)))).centroid

    assert lon == pytest.approx(-3.7059658509171047, abs=1e-7)
    assert lat == pytest.approx(40.4148734366865, abs=1e-7)


def test_a_geometry_in_another_zone_is_measured_in_its_own_zone():
    # 100 m square at (500000 + 100 000, 4400000) in UTM 31N, near the Catalan coast.
    # pyproj: (430887.5643, 4581837.8534) <-> (2.1734, 41.3851): checked in test_utm.
    from backend.app.external_data.domain.utm import inverse_utm

    corners = [(430000, 4580000), (430100, 4580000), (430100, 4580100), (430000, 4580100)]
    ring = tuple(inverse_utm(x, y, 31) for x, y in corners + corners[:1])

    assert a_plot(PlotGeometry((PlotPolygon(ring),))).computed_area_m2 == pytest.approx(
        10000.0, abs=0.01
    )


def test_a_plot_outside_zones_28_to_31_cannot_be_measured_so_it_is_rejected_on_creation():
    ring = ((10.0, 40.0), (10.001, 40.0), (10.001, 40.001), (10.0, 40.0))

    with pytest.raises(InvalidPlotGeometry):
        a_plot(PlotGeometry((PlotPolygon(ring),)))


# --- comparison with the cadastral area -------------------------------------------------------


def test_the_difference_is_a_signed_percentage_of_the_cadastral_area():
    plot = a_plot(cadastral_area_m2=9900)

    assert plot.difference_pct == pytest.approx((10000 - 9900) / 9900 * 100, abs=0.01)
    assert a_plot(cadastral_area_m2=10100).difference_pct < 0


def test_a_difference_above_three_percent_raises_the_warning():
    assert AREA_WARNING_PCT == 3.0
    assert a_plot(cadastral_area_m2=9600).area_warning is True  # +4.2 %
    assert a_plot(cadastral_area_m2=10400).area_warning is True  # -3.8 %


def test_a_difference_below_three_percent_has_no_warning():
    assert a_plot(cadastral_area_m2=9800).area_warning is False  # +2.0 %
    assert a_plot(cadastral_area_m2=10000).area_warning is False


def test_without_a_cadastral_area_there_is_no_difference_and_no_warning():
    for missing in (None, 0):
        plot = a_plot(cadastral_area_m2=missing)
        assert plot.difference_pct is None
        assert plot.area_warning is False


# --- serialisation ----------------------------------------------------------------------------


def test_to_dict_has_the_api_shape_with_english_keys():
    data = a_plot(cadastral_area_m2=9900).to_dict()

    assert set(data) == {
        "reference",
        "geometry",
        "computed_area_m2",
        "cadastral_area_m2",
        "difference_pct",
        "area_warning",
        "boundary_lengths_m",
        "centroid",
    }
    assert data["reference"] == REFERENCE
    assert data["geometry"]["type"] == "Polygon"
    assert data["cadastral_area_m2"] == 9900
    assert data["area_warning"] is False
    assert len(data["centroid"]) == 2  # [lon, lat]


def test_from_dict_rebuilds_the_plot_and_ignores_unknown_keys():
    original = a_plot(PlotGeometry((PlotPolygon(OUTER, (HOLE,)),)), cadastral_area_m2=9500)
    data = original.to_dict() | {"owner_name": "SAMPLE HOLDER"}

    rebuilt = Plot.from_dict(data)

    assert rebuilt.reference == original.reference
    assert rebuilt.cadastral_area_m2 == 9500
    assert rebuilt.to_dict() == original.to_dict()


def test_the_model_has_no_ownership_fields():
    names = {f.name for f in dataclasses.fields(Plot)}

    assert names == {"reference", "geometry", "cadastral_area_m2"}


def test_plot_not_found_is_a_cadastre_not_found_with_its_own_code_and_message():
    from backend.app.external_data.domain.errors import CadastreNotFound, PlotNotFound

    error = PlotNotFound()

    assert isinstance(error, CadastreNotFound)
    assert error.code == "plot_not_found"
    assert str(error) == "No se encontró la parcela en el Catastro."


# --- vertices and distances (for the terrain slope) ----------------------------------------------


def _plot_from_metres(points):
    """A plot drawn in UTM 30N metres (the zone of the test squares), as the squares are."""
    from backend.app.external_data.domain.utm import inverse_utm

    ring = [inverse_utm(500000 + x, 4474000 + y, 30) for x, y in points]
    return a_plot(PlotGeometry((PlotPolygon(tuple(ring) + (ring[0],)),)), cadastral_area_m2=None)


# A right triangle with legs 90 m and 60 m: its centroid is at (30, 20) m.
TRIANGLE = [(0, 0), (90, 0), (0, 60)]


def test_vertices_are_the_exterior_positions_without_the_closing_repeat():
    assert a_plot().vertices == OUTER[:-1]


def test_vertices_of_several_polygons_follow_each_exterior_and_skip_holes():
    plot = a_plot(PlotGeometry((PlotPolygon(OUTER, (HOLE,)), PlotPolygon(SECOND))))

    assert plot.vertices == OUTER[:-1] + SECOND[:-1]


def test_the_farthest_vertices_come_first_with_their_distance_to_the_centroid_in_metres():
    plot = _plot_from_metres(TRIANGLE)

    (first, first_m), (second, second_m) = plot.farthest_vertices(2)

    assert first == plot.vertices[1] and first_m == pytest.approx(63.246, abs=0.01)
    assert second == plot.vertices[2] and second_m == pytest.approx(50.0, abs=0.01)


def test_asking_for_more_vertices_than_exist_returns_them_all():
    assert len(_plot_from_metres(TRIANGLE).farthest_vertices(10)) == 3


def test_equally_far_vertices_keep_their_order_in_the_outline():
    plot = a_plot()  # a square: the four corners are equally far from the centre

    assert [v for v, _ in plot.farthest_vertices(2)] == list(plot.vertices[:2])


def test_a_repeated_vertex_is_counted_once():
    ring = [(0, 0), (90, 0), (90, 0), (0, 60)]

    assert len(_plot_from_metres(ring).farthest_vertices(10)) == 3


def test_the_distance_between_two_positions_is_horizontal_metres():
    plot = _plot_from_metres(TRIANGLE)

    assert plot.horizontal_distance_m(plot.vertices[0], plot.vertices[1]) == pytest.approx(
        90.0, abs=0.01
    )
