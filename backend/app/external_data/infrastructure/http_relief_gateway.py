"""HTTP client of the IDEE WCS 1.0.0 that serves the IGN's 5 m terrain model (no key).

One read-only `GetCoverage` per relief, for the window only (never the whole territory):
`COVERAGE=Elevacion4258_5` in `CRS=EPSG:4258` with `BBOX=lon_min,lat_min,lon_max,lat_max` and
`WIDTH`/`HEIGHT` in cells, answered as `FORMAT=ArcGrid`. Errors come as an XML
`ServiceExceptionReport` with HTTP 200, which the grid reader refuses.
"""

from __future__ import annotations

import httpx

from backend.app.external_data.domain.errors import ReliefUnavailable
from backend.app.external_data.domain.relief import ElevationGrid, ReliefWindow
from backend.app.external_data.infrastructure.arcgrid_parser import parse_arcgrid
from backend.app.external_data.infrastructure.http_retry import build_client, get_body

BASE_URL = "https://servicios.idee.es/wcs-inspire/mdt"
COVERAGE = "Elevacion4258_5"
TIMEOUT_SECONDS = 15.0  # a 100 x 100 cell window answers in well under a second, normally
_DEGREE_FORMAT = ".8f"  # fixed notation: never "1e-07"


class HttpReliefGateway:
    def __init__(
        self, base_url: str = BASE_URL, transport: httpx.BaseTransport | None = None
    ) -> None:
        self._client = build_client(base_url, transport, TIMEOUT_SECONDS)

    def fetch(self, window: ReliefWindow) -> ElevationGrid:
        ncols, nrows = window.grid_size
        bbox = ",".join(
            format(value, _DEGREE_FORMAT)
            for value in (window.min_lon, window.min_lat, window.max_lon, window.max_lat)
        )
        body = get_body(
            self._client,
            "",
            {
                "SERVICE": "WCS",
                "VERSION": "1.0.0",
                "REQUEST": "GetCoverage",
                "COVERAGE": COVERAGE,
                "CRS": "EPSG:4258",
                "BBOX": bbox,
                "WIDTH": ncols,
                "HEIGHT": nrows,
                "FORMAT": "ArcGrid",
            },
            ReliefUnavailable,
        )
        return parse_arcgrid(body, ncols, nrows)
