"""Reader of the IDEE WCS answer for `FORMAT=ArcGrid` (`application/asc`, ESRI ASCII grid).

A header of `key value` lines (`ncols`, `nrows`, `xllcorner`, `yllcorner`, `dx`, `dy`, and
`NODATA_value` when the model has gaps) followed by the heights in metres, one row per line,
**north to south**. Reads a white list of header keys and nothing else: an XML
`ServiceExceptionReport` (which the service sends with HTTP 200), an HTML page, a different
size than the one asked for or an implausible height all make the relief unavailable.
"""

from __future__ import annotations

import math

from backend.app.external_data.domain.errors import ReliefUnavailable
from backend.app.external_data.domain.relief import ElevationGrid, InvalidReliefData

# The largest valid answer (100 x 100 cells of "-500.000 ") is about 90 kB.
MAX_BODY_BYTES = 1_000_000

# Plausible ground levels in metres (the same bounds as the Open-Meteo parser).
MIN_HEIGHT_M = -500.0
MAX_HEIGHT_M = 9000.0

_SIZE_KEYS = ("ncols", "nrows")
_GEO_KEYS = ("xllcorner", "yllcorner", "xllcenter", "yllcenter", "cellsize", "dx", "dy")
_NODATA_KEY = "nodata_value"
_KNOWN_KEYS = {*_SIZE_KEYS, *_GEO_KEYS, _NODATA_KEY}


def _number(text: str) -> float:
    try:
        value = float(text)
    except ValueError as error:
        raise ReliefUnavailable() from error
    if not math.isfinite(value):
        raise ReliefUnavailable()
    return value


def _integer(text: str) -> int:
    try:
        return int(text)
    except ValueError as error:
        raise ReliefUnavailable() from error


def _starts_a_number(line: str) -> bool:
    first = line.split(None, 1)[0]
    return first[0] in "+-.0123456789" and first.lower() not in {"-inf", "+inf", "inf", "nan"}


def _read_header(lines: list[str]) -> tuple[dict[str, str], int]:
    """The header entries and the index of the first line of heights."""
    header: dict[str, str] = {}
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        if line and _starts_a_number(line):
            break
        index += 1
        if not line:
            continue
        parts = line.split()
        key = parts[0].lower()
        if key not in _KNOWN_KEYS or key in header or len(parts) != 2:
            raise ReliefUnavailable()
        header[key] = parts[1]
    return header, index


def parse_arcgrid(body: bytes, ncols: int, nrows: int) -> ElevationGrid:
    """The grid in `body`, which must be exactly `ncols` x `nrows`. Raises `ReliefUnavailable`
    for anything else."""
    if len(body) > MAX_BODY_BYTES:
        raise ReliefUnavailable()
    try:
        lines = body.decode("ascii").splitlines()
    except UnicodeDecodeError as error:
        raise ReliefUnavailable() from error
    header, first_row = _read_header(lines)

    if _integer(header.get("ncols", "")) != ncols or _integer(header.get("nrows", "")) != nrows:
        raise ReliefUnavailable()
    for key in _GEO_KEYS:
        if key in header:
            _number(header[key])
    nodata = _number(header[_NODATA_KEY]) if _NODATA_KEY in header else None

    tokens = [token for line in lines[first_row:] for token in line.split()]
    if len(tokens) != ncols * nrows:
        raise ReliefUnavailable()
    values: list[float | None] = []
    for token in tokens:
        height = _number(token)
        if height == nodata:
            values.append(None)
        elif MIN_HEIGHT_M <= height <= MAX_HEIGHT_M:
            values.append(height)
        else:
            raise ReliefUnavailable()
    try:
        return ElevationGrid(ncols, nrows, tuple(values))
    except InvalidReliefData as error:
        raise ReliefUnavailable() from error
