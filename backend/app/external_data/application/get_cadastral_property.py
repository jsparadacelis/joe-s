"""Look a property up in the Catastro through the study's 30-day cache."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta, timezone

from backend.app.external_data.domain.cadastral_property import CadastralProperty
from backend.app.external_data.domain.cadastral_reference import validate_cadastral_reference
from backend.app.external_data.domain.ports import CadastreCache, CadastreGateway

CACHE_MAX_AGE = timedelta(days=30)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class GetCadastralProperty:
    def __init__(
        self,
        gateway: CadastreGateway,
        cache: CadastreCache,
        clock: Callable[[], datetime] = _utc_now,
    ) -> None:
        self._gateway = gateway
        self._cache = cache
        self._clock = clock

    def execute(self, raw_reference: str) -> CadastralProperty:
        """Raises `InvalidCadastralReference`, `CadastreNotFound` or `CadastreUnavailable`.

        An expired cache entry is never a fallback: data is fresh or absent, and absent means
        the person enters it by hand.
        """
        reference = validate_cadastral_reference(raw_reference)
        cached = self._cache.get(reference, CACHE_MAX_AGE)
        if cached is not None:
            return cached
        found = self._gateway.fetch(reference)
        self._cache.put(found, self._clock())
        return found
