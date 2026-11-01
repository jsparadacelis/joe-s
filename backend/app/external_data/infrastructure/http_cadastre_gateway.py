"""HTTP client of the public Catastro service (XML, no certificate needed).

Two read-only calls per property: `Consulta_DNPRC` (20-character reference: data and
constructive units) and `Consulta_CPMRC` (14-character plot reference: WGS84 coordinates).
Service errors arrive as HTTP 200 with an `<lerr>` body, so the body decides, not the status.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any

import httpx

from backend.app.external_data.domain.cadastral_property import CadastralProperty
from backend.app.external_data.domain.cadastral_reference import PLOT_LENGTH
from backend.app.external_data.infrastructure.cadastre_parser import (
    parse_coordinates,
    parse_property,
)
from backend.app.external_data.infrastructure.http_retry import build_client, get_body

BASE_URL = "https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/"


class HttpCadastreGateway:
    def __init__(
        self, base_url: str = BASE_URL, transport: httpx.BaseTransport | None = None
    ) -> None:
        self._client = build_client(base_url, transport)

    def fetch(self, reference: str) -> CadastralProperty:
        found = parse_property(
            reference,
            self._get(
                "OVCCallejero.asmx/Consulta_DNPRC",
                {"Provincia": "", "Municipio": "", "RC": reference},
            ),
        )
        latitude, longitude = parse_coordinates(
            self._get(
                "OVCCoordenadas.asmx/Consulta_CPMRC",
                {
                    "Provincia": "",
                    "Municipio": "",
                    "SRS": "EPSG:4326",
                    "RC": reference[:PLOT_LENGTH],
                },
            )
        )
        return replace(found, latitude=latitude, longitude=longitude)

    def _get(self, path: str, params: dict[str, Any]) -> bytes:
        return get_body(self._client, path, params)
