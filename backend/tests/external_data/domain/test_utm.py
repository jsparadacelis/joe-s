"""Local UTM projection in pure Python, checked against values computed once with pyproj.

The constants below were produced outside the repo (pyproj 3.3.0, EPSG:326zz, always_xy) and
fixed here, so the test is independent of the implementation.
"""

import pytest

from backend.app.external_data.domain.utm import (
    UnsupportedZone,
    inverse_utm,
    project_utm,
    utm_zone,
)

# (lon, lat, zone, easting, northing) in metres; sample points, not tied to any client.
KNOWN_POINTS = [
    (-15.4134, 28.1235, 28, 459399.7071, 3110952.264),
    (-16.25, 28.47, 28, 377628.8948, 3149904.857),
    (-18.0, 27.8, 28, 204412.7805, 3078658.9205),
    (-12.0, 28.0, 29, 204956.5114, 3100830.8181),
    (-8.54, 42.88, 29, 537566.754, 4747591.7575),
    (-3.7038, 40.4168, 30, 440290.4581, 4474257.382),
    (-6.0, 37.39, 30, 234409.1339, 4142362.1797),
    (-0.0001, 39.5, 30, 757951.1715, 4376562.0612),
    (0.039, 38.64, 31, 242282.1271, 4280988.5536),
    (2.1734, 41.3851, 31, 430887.5643, 4581837.8534),
    (3.1, 39.9, 31, 508548.4094, 4416663.078),
]


@pytest.mark.parametrize(("lon", "lat", "zone", "easting", "northing"), KNOWN_POINTS)
def test_the_forward_projection_matches_pyproj_to_a_millimetre(lon, lat, zone, easting, northing):
    assert utm_zone(lon) == zone

    x, y = project_utm(lon, lat, zone)

    assert x == pytest.approx(easting, abs=0.001)
    assert y == pytest.approx(northing, abs=0.001)


@pytest.mark.parametrize(("lon", "lat", "zone", "easting", "northing"), KNOWN_POINTS)
def test_the_inverse_projection_recovers_the_geographic_point(lon, lat, zone, easting, northing):
    back_lon, back_lat = inverse_utm(easting, northing, zone)

    assert back_lon == pytest.approx(lon, abs=1e-8)
    assert back_lat == pytest.approx(lat, abs=1e-8)


def test_the_inverse_matches_pyproj_far_from_the_central_meridian():
    # pyproj: zone 28 (700000, 3100000) -> (-12.965927034747667, 28.01020024594077)
    lon, lat = inverse_utm(700000, 3100000, 28)

    assert lon == pytest.approx(-12.965927034747667, abs=1e-8)
    assert lat == pytest.approx(28.01020024594077, abs=1e-8)


def test_the_central_meridian_has_the_false_easting_and_the_scale_factor():
    x, y = project_utm(3.0, 0.0, 31)

    assert x == pytest.approx(500000.0, abs=1e-6)
    assert y == pytest.approx(0.0, abs=1e-6)
    # Any latitude on the central meridian keeps the false easting.
    assert project_utm(3.0, 40.0, 31)[0] == pytest.approx(500000.0, abs=1e-6)


@pytest.mark.parametrize(
    ("lon", "zone"),
    [(-18.0, 28), (-13.0, 28), (-12.0, 29), (-6.0, 30), (0.0, 31), (5.99, 31), (-12.0001, 28)],
)
def test_the_zone_is_six_degrees_wide_from_minus_180(lon, zone):
    assert utm_zone(lon) == zone


@pytest.mark.parametrize("lon", [-18.5, 6.0, 20.0, -60.0])
def test_a_longitude_outside_zones_28_to_31_is_unsupported(lon):
    with pytest.raises(UnsupportedZone):
        utm_zone(lon)


def test_projecting_into_a_zone_outside_28_to_31_is_unsupported():
    with pytest.raises(UnsupportedZone):
        project_utm(10.0, 40.0, 32)
    with pytest.raises(UnsupportedZone):
        inverse_utm(500000, 4000000, 27)
