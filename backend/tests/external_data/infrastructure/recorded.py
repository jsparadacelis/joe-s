"""Loader of the recorded Catastro responses (fictitious street and municipality)."""

from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def with_holder_fields(xml: bytes) -> bytes:
    """The same response with ownership fields injected at several levels (never expected)."""
    text = xml.decode()
    holder = (
        "<titular><nif>00000000T</nif><nom>HOLDER NAME SAMPLE</nom>"
        "<ldt>HOLDER ADDRESS SAMPLE</ldt></titular>"
    )
    text = text.replace("<bi>", f"<bi>{holder}<nif>00000000T</nif>", 1)
    text = text.replace("<cons>", f"<cons><nom>HOLDER NAME SAMPLE</nom>{holder}", 1)
    text = text.replace("<debi>", "<debi><titular>HOLDER NAME SAMPLE</titular>", 1)
    assert "HOLDER NAME SAMPLE" in text
    return text.encode()


def with_interior_ring(xml: bytes) -> bytes:
    """The recorded plot with a hole (lat lon order, as the service writes it)."""
    hole = (
        '<gml:interior><gml:LinearRing><gml:posList srsDimension="2" count="5">'
        "38.6401 0.03945 38.64012 0.03945 38.64012 0.03947 38.6401 0.03947 38.6401 0.03945"
        "</gml:posList></gml:LinearRing></gml:interior>"
    )
    text = xml.decode("latin-1").replace("</gml:exterior>", "</gml:exterior>" + hole, 1)
    assert "gml:interior" in text
    return text.encode("latin-1")


def with_second_patch(xml: bytes) -> bytes:
    """The recorded plot split in two polygon patches (a multipart plot)."""
    patch = (
        '<gml:PolygonPatch><gml:exterior><gml:LinearRing><gml:posList srsDimension="2" '
        'count="5">38.6395 0.0398 38.6396 0.0398 38.6396 0.0399 38.6395 0.0399 38.6395 0.0398'
        "</gml:posList></gml:LinearRing></gml:exterior></gml:PolygonPatch>"
    )
    text = xml.decode("latin-1").replace("</gml:patches>", patch + "</gml:patches>", 1)
    assert text.count("PolygonPatch>") == 4
    return text.encode("latin-1")


def with_wfs_holder_fields(xml: bytes) -> bytes:
    """The recorded plot with ownership-like fields injected at several levels (never expected)."""
    text = xml.decode("latin-1")
    holder = "<cp:owner><nom>HOLDER NAME SAMPLE</nom><nif>00000000T</nif></cp:owner>"
    text = text.replace("<cp:label>", holder + "<cp:label>", 1)
    text = text.replace("<member>", "<member><titular>HOLDER NAME SAMPLE</titular>", 1)
    text = text.replace(
        "<cp:areaValue", "<cp:ownerName>HOLDER NAME SAMPLE</cp:ownerName><cp:areaValue", 1
    )
    assert text.count("HOLDER NAME SAMPLE") == 3
    return text.encode("latin-1")
