"""Test helpers: an ES256 key pair generated on the fly, a JWKS built from it and token makers.

Nothing here touches the network or a real Supabase project."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

SUPABASE_URL = "https://sample-project.supabase.example"
ISSUER = f"{SUPABASE_URL}/auth/v1"


class KeyPair:
    def __init__(self, kid: str) -> None:
        self.kid = kid
        self.private = ec.generate_private_key(ec.SECP256R1())
        self.private_pem = self.private.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
        self.public_pem = self.private.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
        )

    @property
    def jwk(self) -> dict[str, Any]:
        data = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(self.private.public_key()))
        return {**data, "kid": self.kid, "alg": "ES256", "use": "sig"}


def jwks(*pairs: KeyPair) -> dict[str, Any]:
    return {"keys": [pair.jwk for pair in pairs]}


def claims(**overrides: Any) -> dict[str, Any]:
    now = int(time.time())
    values: dict[str, Any] = {
        "sub": "11111111-1111-1111-1111-111111111111",
        "email": "ana@example.com",
        "aud": "authenticated",
        "iss": ISSUER,
        "iat": now,
        "exp": now + 3600,
        "aal": "aal1",
        "user_metadata": {"email_verified": True},
    }
    values.update(overrides)
    return {k: v for k, v in values.items() if v is not None}


def sign(pair: KeyPair, payload: dict[str, Any] | None = None, **header: Any) -> str:
    headers = {"kid": pair.kid, **header}
    return jwt.encode(
        claims() if payload is None else payload,
        pair.private_pem,
        algorithm="ES256",
        headers=headers,
    )


def _b64(data: bytes) -> bytes:
    return base64.urlsafe_b64encode(data).rstrip(b"=")


def forge(payload: dict[str, Any], alg: str, secret: bytes = b"", kid: str | None = None) -> str:
    """Hand-made token (PyJWT refuses to sign with a PEM public key as an HMAC secret)."""
    header: dict[str, Any] = {"alg": alg, "typ": "JWT"}
    if kid is not None:
        header["kid"] = kid
    signing_input = _b64(json.dumps(header).encode()) + b"." + _b64(json.dumps(payload).encode())
    if alg == "none":
        signature = b""
    else:
        signature = _b64(hmac.new(secret, signing_input, hashlib.sha256).digest())
    return (signing_input + b"." + signature).decode()
