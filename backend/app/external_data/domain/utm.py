"""Transverse Mercator (UTM, WGS84) in pure Python, for the zones that cover Spain (28-31).

Krüger series of order 4 in the third flattening `n` (Karney 2011, sub-millimetre inside a
zone). Plots are measured in the metric plane of the UTM zone of their centroid, the same
kind of plane the Catastro uses to compute its official area.
"""

from __future__ import annotations

import math

MIN_ZONE = 28
MAX_ZONE = 31

_A = 6378137.0  # WGS84 semi-major axis
_F = 1 / 298.257223563
_K0 = 0.9996
_FALSE_EASTING = 500000.0
_FALSE_NORTHING_SOUTH = 10000000.0

_N = _F / (2 - _F)
_N2, _N3, _N4 = _N**2, _N**3, _N**4
_RECTIFYING_RADIUS = _A / (1 + _N) * (1 + _N2 / 4 + _N4 / 64)
_ALPHA = (
    _N / 2 - 2 * _N2 / 3 + 5 * _N3 / 16 + 41 * _N4 / 180,
    13 * _N2 / 48 - 3 * _N3 / 5 + 557 * _N4 / 1440,
    61 * _N3 / 240 - 103 * _N4 / 140,
    49561 * _N4 / 161280,
)
_BETA = (
    _N / 2 - 2 * _N2 / 3 + 37 * _N3 / 96 - _N4 / 360,
    _N2 / 48 + _N3 / 15 - 437 * _N4 / 1440,
    17 * _N3 / 480 - 37 * _N4 / 840,
    4397 * _N4 / 161280,
)
_DELTA = (
    2 * _N - 2 * _N2 / 3 - 2 * _N3 + 116 * _N4 / 45,
    7 * _N2 / 3 - 8 * _N3 / 5 - 227 * _N4 / 45,
    56 * _N3 / 15 - 136 * _N4 / 35,
    4279 * _N4 / 630,
)


class UnsupportedZone(ValueError):
    """The longitude or zone is outside the UTM zones 28-31 that cover Spain."""


def _check_zone(zone: int) -> None:
    if not MIN_ZONE <= zone <= MAX_ZONE:
        raise UnsupportedZone(f"UTM zone {zone} is outside {MIN_ZONE}-{MAX_ZONE}")


def utm_zone(longitude: float) -> int:
    """The six-degree UTM zone of a longitude, restricted to zones 28-31."""
    zone = math.floor((longitude + 180) / 6) + 1
    _check_zone(zone)
    return zone


def _central_meridian(zone: int) -> float:
    return math.radians(zone * 6 - 183)


def project_utm(longitude: float, latitude: float, zone: int, *, south: bool = False) -> tuple:
    """(easting, northing) in metres of a WGS84 point in the given zone."""
    _check_zone(zone)
    phi = math.radians(latitude)
    lam = math.radians(longitude) - _central_meridian(zone)
    q = 2 * math.sqrt(_N) / (1 + _N)
    sin_phi = math.sin(phi)
    t = math.sinh(math.atanh(sin_phi) - q * math.atanh(q * sin_phi))
    xi0 = math.atan2(t, math.cos(lam))
    eta0 = math.atanh(math.sin(lam) / math.sqrt(1 + t * t))
    xi, eta = xi0, eta0
    for j, alpha in enumerate(_ALPHA, start=1):
        xi += alpha * math.sin(2 * j * xi0) * math.cosh(2 * j * eta0)
        eta += alpha * math.cos(2 * j * xi0) * math.sinh(2 * j * eta0)
    easting = _FALSE_EASTING + _K0 * _RECTIFYING_RADIUS * eta
    northing = _K0 * _RECTIFYING_RADIUS * xi + (_FALSE_NORTHING_SOUTH if south else 0.0)
    return easting, northing


def inverse_utm(easting: float, northing: float, zone: int, *, south: bool = False) -> tuple:
    """(longitude, latitude) in degrees of a point given in the metres of a UTM zone."""
    _check_zone(zone)
    northing -= _FALSE_NORTHING_SOUTH if south else 0.0
    xi = northing / (_K0 * _RECTIFYING_RADIUS)
    eta = (easting - _FALSE_EASTING) / (_K0 * _RECTIFYING_RADIUS)
    xi0, eta0 = xi, eta
    for j, beta in enumerate(_BETA, start=1):
        xi0 -= beta * math.sin(2 * j * xi) * math.cosh(2 * j * eta)
        eta0 -= beta * math.cos(2 * j * xi) * math.sinh(2 * j * eta)
    chi = math.asin(math.sin(xi0) / math.cosh(eta0))
    phi = chi + sum(delta * math.sin(2 * j * chi) for j, delta in enumerate(_DELTA, start=1))
    lam = math.atan2(math.sinh(eta0), math.cos(xi0))
    return math.degrees(_central_meridian(zone) + lam), math.degrees(phi)
