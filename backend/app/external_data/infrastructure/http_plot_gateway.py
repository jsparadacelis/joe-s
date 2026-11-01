"""HTTP client of the public INSPIRE WFS of the Catastro (cadastral parcels, no certificate).

One read-only call per plot: the stored query `GetParcel` with the 14-character plot reference.
`srsname=EPSG::4326` is always requested: it is valid for the whole territory (25830 fails for
Canary Islands plots) and it is what GeoJSON needs. Errors arrive as HTTP 200 with an
`ExceptionReport` body, so the body decides, not the status.
"""

from __future__ import annotations

import httpx

from backend.app.external_data.domain.plot import Plot
from backend.app.external_data.infrastructure.http_retry import build_client, get_body
from backend.app.external_data.infrastructure.plot_parser import parse_plot

BASE_URL = "http://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx"


class HttpPlotGateway:
    def __init__(
        self, base_url: str = BASE_URL, transport: httpx.BaseTransport | None = None
    ) -> None:
        self._client = build_client(base_url, transport)

    def fetch(self, plot_reference: str) -> Plot:
        body = get_body(
            self._client,
            "",
            {
                "service": "wfs",
                "version": "2",
                "request": "getfeature",
                "STOREDQUERY_ID": "GetParcel",
                "refcat": plot_reference,
                "srsname": "EPSG::4326",
            },
        )
        return parse_plot(plot_reference, body)
