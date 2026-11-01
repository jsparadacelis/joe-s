"""Parser of the Open-Meteo elevation answer: `{"elevation": [metres, ...]}`.

Reads a white list (the `elevation` list) and nothing else. A 400 comes with
`{"error": true, "reason": ...}` and never reaches this parser, but if an error body arrives
with status 200 it carries no `elevation` list and is refused the same way.
"""

from __future__ import annotations

from backend.app.external_data.domain.errors import ExternalServiceUnavailable
from backend.app.external_data.infrastructure.json_support import as_number, load_object

# Plausible ground levels in metres (the same bounds as the `altitude` datum).
MIN_ELEVATION_M = -500.0
MAX_ELEVATION_M = 9000.0


def parse_elevations(body: bytes, expected: int) -> list[float]:
    """`expected` elevations in metres. Raises `ExternalServiceUnavailable` for anything else:
    an error body, a different count, a value that is not a plausible number."""
    data = load_object(body)
    if data.get("error") is True:
        raise ExternalServiceUnavailable()
    raw = data.get("elevation")
    if not isinstance(raw, list) or len(raw) != expected:
        raise ExternalServiceUnavailable()
    elevations = [as_number(value) for value in raw]
    if any(h is None or not MIN_ELEVATION_M <= h <= MAX_ELEVATION_M for h in elevations):
        raise ExternalServiceUnavailable()
    return elevations  # type: ignore[return-value]
