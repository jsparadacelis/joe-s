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
