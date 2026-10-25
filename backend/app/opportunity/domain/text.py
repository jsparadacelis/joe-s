"""Text rules shared by the opportunity inputs."""

from __future__ import annotations


def is_storable(text: str) -> bool:
    """Postgres text cannot hold NUL, and lone surrogates are not valid UTF-8."""
    if "\x00" in text:
        return False
    try:
        text.encode("utf-8")
    except UnicodeEncodeError:
        return False
    return True
