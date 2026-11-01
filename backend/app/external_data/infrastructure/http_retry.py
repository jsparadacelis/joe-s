"""The one GET policy shared by the Catastro HTTP gateways: 10 s timeout, a single retry."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import httpx

from backend.app.external_data.domain.errors import CadastreUnavailable

TIMEOUT_SECONDS = 10.0
ATTEMPTS = 2  # the first try and a single retry


def build_client(
    base_url: str,
    transport: httpx.BaseTransport | None,
    timeout_seconds: float = TIMEOUT_SECONDS,
) -> httpx.Client:
    return httpx.Client(
        base_url=base_url, timeout=httpx.Timeout(timeout_seconds), transport=transport
    )


def get_body(
    client: httpx.Client,
    path: str,
    params: dict[str, Any],
    unavailable: Callable[[], Exception] = CadastreUnavailable,
) -> bytes:
    """The body of a 200 answer; one retry on network errors, timeouts and 5xx. Whatever else
    happens raises `unavailable()` (the Catastro's error unless the caller says otherwise)."""
    for attempt in range(ATTEMPTS):
        last = attempt == ATTEMPTS - 1
        try:
            response = client.get(path, params=params)
        except httpx.HTTPError as error:
            if last:
                raise unavailable() from error
            continue
        if response.status_code >= 500:
            if last:
                raise unavailable()
            continue
        if response.status_code != 200:
            raise unavailable()
        return response.content
    raise unavailable()  # pragma: no cover
