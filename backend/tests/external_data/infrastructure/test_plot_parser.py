"""The WFS GML parser: white list of fields, lat-lon swap, errors, and the 2.908 m2 criterion."""

import pytest

from backend.app.external_data.domain.errors import CadastreUnavailable, PlotNotFound
from backend.app.external_data.infrastructure.plot_parser import parse_plot
from backend.tests.external_data.infrastructure.recorded import (
    fixture,
    with_interior_ring,
    with_second_patch,
    with_wfs_holder_fields,
)

PLOT = "4714805BC6841S"
OFFICIAL_AREA_M2 = 2908  # the acceptance criterion: "about 2,908 m2"

# Measured with pyproj (EPSG:32631) on the same recorded, 6-decimal coordinates: the planar
# area of the ring. Pins the pure-Python projection to an independent implementation.
PYPROJ_AREA_M2 = 2905.9935913085938

# Observed error of the computed area against the official 2,908 m2 is 0.07 % (about 2 m2): the
# difference between a local UTM plane on 11 cm-resolution WGS84 coordinates and the Catastro's
# own ETRS89 25830 figures (2,907.85 m2 from its raw coordinates). The test allows 0.25 %
# (about 7 m2): three times the observed error, still far below the 3 % warning threshold.
TOLERANCE_PCT = 0.25


def test_the_recorded_plot_is_read_with_its_official_area_and_one_polygon():
    plot = parse_plot(PLOT, fixture("wfs_parcel_ok.xml"))

    assert plot.reference == PLOT
    assert plot.cadastral_area_m2 == OFFICIAL_AREA_M2
    assert len(plot.geometry.polygons) == 1
    assert plot.geometry.polygons[0].interiors == ()


def test_positions_are_swapped_from_lat_lon_to_lon_lat():
    exterior = parse_plot(PLOT, fixture("wfs_parcel_ok.xml")).geometry.polygons[0].exterior

    assert exterior[0] == (0.038965, 38.64042)  # the service wrote "38.64042 0.038965"
    assert exterior[0] == exterior[-1]
    assert len(exterior) == 28


def test_the_computed_area_is_about_2908_square_metres():
    plot = parse_plot(PLOT, fixture("wfs_parcel_ok.xml"))

    assert plot.computed_area_m2 == pytest.approx(OFFICIAL_AREA_M2, rel=TOLERANCE_PCT / 100)
    assert abs(plot.difference_pct) < TOLERANCE_PCT
    assert plot.area_warning is False


def test_the_computed_area_equals_the_independent_pyproj_value():
    plot = parse_plot(PLOT, fixture("wfs_parcel_ok.xml"))

    assert plot.computed_area_m2 == pytest.approx(PYPROJ_AREA_M2, abs=0.01)


def test_the_recorded_centroid_is_the_services_reference_point():
    lon, lat = parse_plot(PLOT, fixture("wfs_parcel_ok.xml")).centroid

    assert lon == pytest.approx(0.039432, abs=2e-5)  # cp:referencePoint 38.640234 0.039432
    assert lat == pytest.approx(38.640234, abs=2e-5)


def test_an_interior_ring_becomes_a_hole():
    plot = parse_plot(PLOT, with_interior_ring(fixture("wfs_parcel_ok.xml")))

    (polygon,) = plot.geometry.polygons
    assert len(polygon.interiors) == 1
    assert polygon.interiors[0][0] == (0.03945, 38.6401)
    assert plot.computed_area_m2 < parse_plot(PLOT, fixture("wfs_parcel_ok.xml")).computed_area_m2


def test_several_patches_become_a_multipolygon():
    plot = parse_plot(PLOT, with_second_patch(fixture("wfs_parcel_ok.xml")))

    assert len(plot.geometry.polygons) == 2
    assert plot.geometry.to_geojson()["type"] == "MultiPolygon"


def test_no_ownership_field_reaches_the_plot():
    body = with_wfs_holder_fields(fixture("wfs_parcel_ok.xml"))

    plot = parse_plot(PLOT, body)

    text = repr(plot) + repr(plot.to_dict())
    assert "HOLDER" not in text and "00000000T" not in text
    assert plot == parse_plot(PLOT, fixture("wfs_parcel_ok.xml"))


def test_a_missing_area_value_leaves_the_official_area_empty():
    body = fixture("wfs_parcel_ok.xml").replace(b'<cp:areaValue uom="m2">2908</cp:areaValue>', b"")

    plot = parse_plot(PLOT, body)

    assert plot.cadastral_area_m2 is None
    assert plot.area_warning is False


def test_a_fractional_area_value_is_rounded():
    body = fixture("wfs_parcel_ok.xml").replace(b">2908<", b">2907.6<")

    assert parse_plot(PLOT, body).cadastral_area_m2 == 2908


def test_an_exception_report_for_a_missing_plot_is_not_found():
    with pytest.raises(PlotNotFound):
        parse_plot(PLOT, fixture("wfs_parcel_not_found.xml"))


def test_any_other_exception_report_is_unavailable():
    with pytest.raises(CadastreUnavailable):
        parse_plot(PLOT, fixture("wfs_exception_invalid.xml"))


def test_an_empty_collection_is_not_found():
    body = b'<FeatureCollection xmlns="http://www.opengis.net/wfs/2.0" numberMatched="0" numberReturned="0"/>'

    with pytest.raises(PlotNotFound):
        parse_plot(PLOT, body)


@pytest.mark.parametrize(
    "body",
    [
        b"",
        b"not xml at all",
        b"<FeatureCollection><unclosed>",
        b"<html><body>Service temporarily unavailable</body></html>",
        b'<FeatureCollection xmlns="http://www.opengis.net/wfs/2.0" numberMatched="1"/>',
    ],
)
def test_garbage_and_unexpected_documents_are_unavailable(body):
    with pytest.raises(CadastreUnavailable):
        parse_plot(PLOT, body)


def test_a_document_with_entities_is_rejected_without_expanding_them():
    bomb = (
        b'<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY a "aaaaaaaaaa">'
        b'<!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;">]><ExceptionReport>&b;</ExceptionReport>'
    )

    with pytest.raises(CadastreUnavailable):
        parse_plot(PLOT, bomb)


@pytest.mark.parametrize(
    ("old", "new"),
    [
        (b'count="28">38.64042', b'count="28">38.64042 oops'),  # odd number of values
        (b"38.640357 0.039031", b"38.640357 abc"),  # not a number
        (b"0.039031 38.64042 0.038965<", b"0.039031 38.64042 0.039<"),  # ring not closed
        (b"38.64042 0.038965 38.640565", b"95.0 0.038965 38.640565"),  # latitude out of range
    ],
)
def test_a_malformed_ring_is_unavailable(old, new):
    body = fixture("wfs_parcel_ok.xml")
    assert old in body
    with pytest.raises(CadastreUnavailable):
        parse_plot(PLOT, body.replace(old, new, 1))


def test_a_plot_without_geometry_is_unavailable():
    start = fixture("wfs_parcel_ok.xml")
    cut = start[: start.index(b"<cp:geometry>")] + start[start.index(b"</cp:geometry>") :]

    with pytest.raises(CadastreUnavailable):
        parse_plot(PLOT, cut)


def test_a_plot_outside_the_supported_zones_is_unavailable():
    body = fixture("wfs_parcel_ok.xml")
    shifted = body.replace(b" 0.03", b" 30.03").replace(b" 0.04", b" 30.04")

    with pytest.raises(CadastreUnavailable):
        parse_plot(PLOT, shifted)
