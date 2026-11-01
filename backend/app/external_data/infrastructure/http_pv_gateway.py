"""HTTP client of PVGIS (European Commission JRC), tool `PVcalc`, grid-connected fixed system.

One read-only GET per location. The reference system is named in the domain (1 kWp, 14 %
losses); PVGIS assumes horizontal panels unless told otherwise, so the optimal slope and
orientation are requested (`optimalangles=1`) and reported back as assumptions.
"""

from __future__ import annotations

import httpx

from backend.app.external_data.domain.errors import ExternalServiceUnavailable
from backend.app.external_data.domain.pv import PEAK_POWER_KWP, SYSTEM_LOSS_PCT, PvLocation, PvYield
from backend.app.external_data.infrastructure.http_retry import build_client, get_body
from backend.app.external_data.infrastructure.pvgis_parser import parse_pv_yield

BASE_URL = "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc"
OPTIMAL_ANGLES = 1
OUTPUT_FORMAT = "json"


class HttpPvGateway:
    def __init__(
        self, base_url: str = BASE_URL, transport: httpx.BaseTransport | None = None
    ) -> None:
        self._client = build_client(base_url, transport)

    def fetch(self, location: PvLocation) -> PvYield:
        body = get_body(
            self._client,
            "",
            {
                "lat": location.latitude,
                "lon": location.longitude,
                "peakpower": PEAK_POWER_KWP,
                "loss": SYSTEM_LOSS_PCT,
                "optimalangles": OPTIMAL_ANGLES,
                "outputformat": OUTPUT_FORMAT,
            },
            ExternalServiceUnavailable,
        )
        return parse_pv_yield(location, body)
