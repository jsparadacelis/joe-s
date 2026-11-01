"""HTTP client of the Open-Meteo elevation API (no key; grid of about 90 m).

One read-only GET per batch of at most 100 positions (the API refuses more with a 400):
`latitude` and `longitude` are comma-separated lists in the same order, and the answer is
`{"elevation": [...]}` in the same order.
"""

from __future__ import annotations

from collections.abc import Sequence

import httpx

from backend.app.external_data.domain.errors import ExternalServiceUnavailable
from backend.app.external_data.domain.plot import Position
from backend.app.external_data.infrastructure.elevation_parser import parse_elevations
from backend.app.external_data.infrastructure.http_retry import build_client, get_body

BASE_URL = "https://api.open-meteo.com/v1/elevation"
MAX_POSITIONS_PER_REQUEST = 100


class HttpElevationGateway:
    def __init__(
        self, base_url: str = BASE_URL, transport: httpx.BaseTransport | None = None
    ) -> None:
        self._client = build_client(base_url, transport)

    def fetch(self, positions: Sequence[Position]) -> list[float]:
        elevations: list[float] = []
        for start in range(0, len(positions), MAX_POSITIONS_PER_REQUEST):
            batch = positions[start : start + MAX_POSITIONS_PER_REQUEST]
            body = get_body(
                self._client,
                "",
                {
                    "latitude": ",".join(str(lat) for _, lat in batch),
                    "longitude": ",".join(str(lon) for lon, _ in batch),
                },
                ExternalServiceUnavailable,
            )
            elevations += parse_elevations(body, len(batch))
        return elevations
