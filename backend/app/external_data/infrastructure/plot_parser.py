"""Parser of the INSPIRE WFS `GetParcel` answer (GML 3.2, requested in EPSG:4326).

Reads a white list of fields and nothing else: `areaValue` and the `exterior`/`interior`
rings of each `PolygonPatch`. Whatever else the service sends (ownership-like fields included)
never reaches the model. The service writes positions as `lat lon` in 4326; the model keeps
`(lon, lat)`, the GeoJSON order, so every pair is swapped here.
"""

from __future__ import annotations

import math
from xml.etree.ElementTree import Element

from backend.app.external_data.domain.errors import CadastreUnavailable, PlotNotFound
from backend.app.external_data.domain.plot import (
    InvalidPlotGeometry,
    Plot,
    PlotGeometry,
    PlotPolygon,
    Ring,
)
from backend.app.external_data.infrastructure.cadastre_parser import parse_xml

_NOT_FOUND_TEXT = "NO SE HA ENCONTRADO LA PARCELA"


def _ring(element: Element) -> Ring:
    text = element.findtext("LinearRing/posList") or ""
    try:
        values = [float(token) for token in text.split()]
    except ValueError as error:
        raise CadastreUnavailable() from error
    if not values or len(values) % 2:
        raise CadastreUnavailable()
    # lat lon -> (lon, lat)
    return tuple((values[i + 1], values[i]) for i in range(0, len(values), 2))


def _official_area(parcel: Element) -> int | None:
    text = (parcel.findtext("areaValue") or "").strip()
    try:
        value = float(text)
    except ValueError:
        return None
    return round(value) if math.isfinite(value) and value >= 0 else None


def parse_plot(plot_reference: str, body: bytes) -> Plot:
    """The plot from a `GetParcel` answer.

    Raises `PlotNotFound` if the service says there is no such plot (it answers HTTP 200 with
    an `ExceptionReport`, so the body decides) and `CadastreUnavailable` for anything else
    that cannot be trusted.
    """
    root = parse_xml(body)
    if root.tag == "ExceptionReport":
        text = " ".join(root.itertext()).upper()
        raise PlotNotFound() if _NOT_FOUND_TEXT in text else CadastreUnavailable()
    parcel = root.find("member/CadastralParcel")
    if parcel is None:
        if root.get("numberMatched") == "0":
            raise PlotNotFound()
        raise CadastreUnavailable()
    patches = parcel.findall("geometry/MultiSurface/surfaceMember/Surface/patches/PolygonPatch")
    try:
        polygons = tuple(
            PlotPolygon(
                _ring(patch.find("exterior")),
                tuple(_ring(interior) for interior in patch.findall("interior")),
            )
            for patch in patches
            if patch.find("exterior") is not None
        )
        return Plot(plot_reference, PlotGeometry(polygons), _official_area(parcel))
    except InvalidPlotGeometry as error:
        raise CadastreUnavailable() from error
