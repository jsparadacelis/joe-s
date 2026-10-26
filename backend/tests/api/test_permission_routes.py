"""A role without permission gets 403 (before any 422) on scoring, settings and sign-up."""

import pytest

from backend.tests.api.auth_support import client_with, dev_settings

# Well-formed bodies with invalid values: they would be 422 if permission were checked second.


def architect_client():
    return client_with(dev_settings(dev_role="architect"))


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("put", "/api/settings/scoring", {}),
        ("post", "/api/projects/PRY-2026-001/scoring", {}),
        ("put", "/api/settings/plan/templates/industrial", {"weeks": "not weeks"}),
        ("put", "/api/settings/plan/scale-factors/large", {"factor": "not a number"}),
        ("post", "/api/opportunities", {}),
    ],
)
def test_an_architect_gets_403_with_the_standard_error_body(method, path, body):
    response = getattr(architect_client(), method)(path, json=body)

    assert response.status_code == 403
    body = response.json()["detail"]
    assert body["code"] == "no_authority"
    assert body["message"].startswith("Solo ")


def test_reading_stays_open_to_every_role():
    client = architect_client()

    assert client.get("/api/me").status_code == 200
