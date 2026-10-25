"""Verify Supabase Auth access tokens (ES256) against the project's published keys (JWKS)."""

from __future__ import annotations

import json
import logging
import time
import urllib.request
from collections.abc import Callable, Mapping
from typing import Any

import jwt

from backend.app.shared.text import is_storable
from backend.app.study.domain.errors import InvalidEmail, Unauthenticated
from backend.app.study.domain.members import normalize_email
from backend.app.study.domain.ports import TokenClaims

logger = logging.getLogger(__name__)

ALGORITHM = "ES256"
AUDIENCE = "authenticated"
_REQUIRED = ["exp", "iss", "aud", "sub"]


def fetch_jwks_over_http(url: str, timeout: float = 5.0) -> Mapping[str, Any]:
    with urllib.request.urlopen(url, timeout=timeout) as response:  # noqa: S310 (https URL from config)
        return json.loads(response.read())


class SupabaseJwtVerifier:
    """Only ES256 is accepted, so `alg: none` and HS256 (algorithm confusion) never verify.

    Keys are cached by `kid`. An unknown `kid` reloads the JWKS (key rotation), at most once per
    `reload_cooldown` seconds so forged `kid`s cannot hammer the endpoint.
    """

    def __init__(
        self,
        supabase_url: str,
        fetch_jwks: Callable[[str], Mapping[str, Any]] = fetch_jwks_over_http,
        *,
        audience: str = AUDIENCE,
        leeway: float = 10.0,
        reload_cooldown: float = 30.0,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._issuer = f"{supabase_url.rstrip('/')}/auth/v1"
        self._jwks_url = f"{self._issuer}/.well-known/jwks.json"
        self._fetch = fetch_jwks
        self._audience = audience
        self._leeway = leeway
        self._cooldown = reload_cooldown
        self._monotonic = monotonic
        self._keys: dict[str, jwt.PyJWK] = {}
        self._loaded = False
        self._last_reload: float | None = None
        self._last_failure: float | None = None

    def verify(self, token: str) -> TokenClaims:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as error:
            raise Unauthenticated() from error
        kid = header.get("kid")
        if header.get("alg") != ALGORITHM or not isinstance(kid, str) or not kid:
            raise Unauthenticated()
        key = self._key_for(kid)
        try:
            payload = jwt.decode(
                token,
                key.key,
                algorithms=[ALGORITHM],
                audience=self._audience,
                issuer=self._issuer,
                leeway=self._leeway,
                options={"require": _REQUIRED},
            )
        except jwt.PyJWTError as error:
            raise Unauthenticated() from error
        return self._claims(payload)

    @staticmethod
    def _claims(payload: Mapping[str, Any]) -> TokenClaims:
        subject, email = payload.get("sub"), payload.get("email")
        if not isinstance(subject, str) or not subject.strip() or not is_storable(subject):
            raise Unauthenticated()
        if not isinstance(email, str) or not email.strip():
            raise Unauthenticated()
        try:
            normalize_email(email)
        except InvalidEmail as error:  # NUL, lone surrogates, too long: would break the lookup
            raise Unauthenticated() from error
        metadata = payload.get("user_metadata")
        verified = payload.get("email_verified") is True or (
            isinstance(metadata, Mapping) and metadata.get("email_verified") is True
        )
        aal = payload.get("aal")
        return TokenClaims(
            subject=subject,
            email=email,
            email_verified=verified,
            aal=aal if isinstance(aal, str) else "aal1",
        )

    def _key_for(self, kid: str) -> jwt.PyJWK:
        if not self._loaded:
            self._load(initial=True)
        key = self._keys.get(kid)
        if key is None:
            now = self._monotonic()
            if self._last_reload is None or now - self._last_reload >= self._cooldown:
                self._last_reload = now
                self._load(initial=False)
                key = self._keys.get(kid)
        if key is None:
            raise Unauthenticated()
        return key

    def _load(self, *, initial: bool) -> None:
        now = self._monotonic()
        if initial and self._last_failure is not None and now - self._last_failure < self._cooldown:
            raise Unauthenticated()
        try:
            document = self._fetch(self._jwks_url)
            keys = {
                jwk["kid"]: jwt.PyJWK(jwk)
                for jwk in document["keys"]
                if jwk.get("kid") and jwk.get("alg", ALGORITHM) == ALGORITHM
            }
        except Exception as error:  # network, JSON or key errors all mean "cannot verify"
            logger.warning("Could not load the Supabase JWKS: %s", type(error).__name__)
            self._last_failure = now
            raise Unauthenticated() from error
        self._keys = keys
        self._loaded = True
        self._last_failure = None
