"""Parser of the Catastro XML answers.

Reads a white list of fields and nothing else, so no ownership data (name, tax id, holder) can
reach the model even if the service started sending it. XML is parsed with `defusedxml`
(no entity expansion, no external entities, no DTDs).
"""

from __future__ import annotations

from xml.etree.ElementTree import Element

from defusedxml import ElementTree
from defusedxml.common import DefusedXmlException

from backend.app.external_data.domain.cadastral_property import (
    BuildingUnit,
    CadastralProperty,
    PropertyClass,
)
from backend.app.external_data.domain.errors import CadastreNotFound, CadastreUnavailable

# Verified against the live service: 4 "not correctly formed", 9 "does not exist". The
# description is also checked so a neighbouring code with the same meaning is not a 503.
_NOT_FOUND_CODES = frozenset({"4", "9"})
_NOT_FOUND_TEXT = ("NO EXISTE", "NO ESTÁ CORRECTAMENTE FORMADA", "NO ESTA CORRECTAMENTE FORMADA")


def _root(body: bytes) -> Element:
    """The document without XML namespaces, or `CadastreUnavailable` if it is not XML."""
    try:
        root = ElementTree.fromstring(body)
    except (ElementTree.ParseError, DefusedXmlException, ValueError) as error:
        raise CadastreUnavailable() from error
    for element in root.iter():
        if isinstance(element.tag, str):
            element.tag = element.tag.rpartition("}")[2]
    return root


def _text(parent: Element | None, path: str) -> str | None:
    if parent is None:
        return None
    value = parent.findtext(path)
    value = value.strip() if value else None
    return value or None


def _integer(parent: Element | None, path: str) -> int | None:
    value = _text(parent, path)
    try:
        return int(value) if value is not None else None
    except ValueError:
        return None


def _raise_service_errors(root: Element) -> None:
    errors = root.findall("lerr/err")
    if not errors:
        return
    for error in errors:
        code = (error.findtext("cod") or "").strip()
        description = (error.findtext("des") or "").upper()
        if code in _NOT_FOUND_CODES or any(text in description for text in _NOT_FOUND_TEXT):
            raise CadastreNotFound()
    raise CadastreUnavailable()


def parse_property(reference: str, body: bytes) -> CadastralProperty:
    """The property from a `Consulta_DNPRC` answer, without coordinates."""
    root = _root(body)
    _raise_service_errors(root)
    info = root.find("bico/bi")
    if info is None:
        raise CadastreUnavailable()
    address = _text(info, "ldt")
    municipality = _text(info, "dt/nm")
    province = _text(info, "dt/np")
    if address is None or municipality is None or province is None:
        raise CadastreUnavailable()
    return CadastralProperty(
        reference=reference,
        address=address,
        municipality=municipality,
        province=province,
        property_class=_property_class(_text(info, "idbi/cn")),
        use=_text(info, "debi/luso"),
        construction_year=_integer(info, "debi/ant"),
        built_area_m2=_integer(info, "debi/sfc"),
        plot_area_m2=_plot_area(root),
        units=tuple(_unit(cons) for cons in root.findall("bico/lcons/cons")),
        latitude=None,
        longitude=None,
    )


def _property_class(value: str | None) -> PropertyClass | None:
    return {"UR": PropertyClass.URBAN, "RU": PropertyClass.RUSTIC}.get(value or "")


def _plot_area(root: Element) -> int | None:
    areas = [_integer(plot, "ssp") for plot in root.findall("bico/lspr/spr/dspr")]
    known = [area for area in areas if area is not None]
    return sum(known) if known else None


def _unit(cons: Element) -> BuildingUnit:
    return BuildingUnit(
        use=_text(cons, "lcd") or "",
        floor=_text(cons, "dt/lourb/loint/pt"),
        area_m2=_integer(cons, "dfcons/stl"),
    )


def parse_coordinates(body: bytes) -> tuple[float, float]:
    """`(latitude, longitude)` WGS84 from a `Consulta_CPMRC` answer.

    Any failure is `CadastreUnavailable`: the property itself was already found, so a missing
    plot here is an inconsistency of the service, not an unknown reference.
    """
    root = _root(body)
    try:
        _raise_service_errors(root)
    except CadastreNotFound as error:
        raise CadastreUnavailable() from error
    geo = root.find("coordenadas/coord/geo")
    try:
        return float(geo.findtext("ycen")), float(geo.findtext("xcen"))  # type: ignore[union-attr, arg-type]
    except (AttributeError, TypeError, ValueError) as error:
        raise CadastreUnavailable() from error
