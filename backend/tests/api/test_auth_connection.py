"""The token is verified before any database connection is opened."""

import time
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from backend.app.api import dependencies
from backend.app.api.dependencies import get_settings, token_verifier
from backend.app.api.main import create_app
from backend.tests.api.auth_support import PAIR, real_verifier, supabase_settings
from backend.tests.study.infrastructure.jwt_helpers import KeyPair, claims, sign


@pytest.fixture
def connection(monkeypatch):
    factory = MagicMock(side_effect=RuntimeError("a connection was opened"))
    monkeypatch.setattr(dependencies, "identity_transaction", factory)
    return factory


@pytest.fixture
def client(connection):
    settings = supabase_settings()
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[token_verifier] = real_verifier
    return TestClient(app, raise_server_exceptions=False)


def token(**overrides):
    return {"Authorization": f"Bearer {sign(PAIR, claims(**overrides))}"}


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer garbage"},
        {"Authorization": "Basic abc"},
        {"Authorization": "Bearer " + sign(KeyPair("route-key"), claims())},
        token(exp=int(time.time()) - 3600, iat=int(time.time()) - 7200),
        token(aud="anon"),
        token(iss="https://evil.example/auth/v1"),
        token(sub=None),
        token(email=None),
        token(email="a\x00b@example.com"),
        token(email="a\ud800b@example.com"),
        token(email="a" * 243 + "@example.com"),
        token(sub="sub\x00"),
    ],
    ids=[
        "no-header",
        "garbage",
        "basic",
        "other-key",
        "expired",
        "aud",
        "iss",
        "no-sub",
        "no-email",
        "nul-email",
        "surrogate-email",
        "long-email",
        "nul-sub",
    ],
)
def test_a_bad_token_costs_no_connection(client, connection, headers):
    response = client.get("/api/members", headers=headers)

    assert response.status_code == 401
    connection.assert_not_called()


def test_an_unverified_email_costs_no_connection(client, connection):
    response = client.get("/api/members", headers=token(user_metadata={"email_verified": False}))

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "email_not_verified"
    connection.assert_not_called()


def test_a_valid_token_does_open_the_connection(client, connection):
    client.get("/api/members", headers=token())

    connection.assert_called_once()
