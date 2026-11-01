"""The cadastre route against real Postgres with a simulated gateway: study cache, 404, 503."""

from unittest.mock import create_autospec

import psycopg
import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import cadastre_gateway, get_settings
from backend.app.api.main import create_app
from backend.app.external_data.domain.errors import CadastreNotFound, CadastreUnavailable
from backend.app.external_data.domain.ports import CadastreGateway
from backend.app.shared.config import Settings
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.tests.external_data.domain.test_cadastral_property import REFERENCE, a_property

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"


@pytest.fixture
def url(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO studies (id, name) VALUES (%s, 'A (sample)'), (%s, 'B (sample)')",
            (STUDY_A, STUDY_B),
        )
    return url


@pytest.fixture
def gateway():
    stub = create_autospec(CadastreGateway, spec_set=True, instance=True)
    stub.fetch.return_value = a_property()
    return stub


@pytest.fixture
def client_for(url, gateway):
    def make(study_id=STUDY_A):
        settings = Settings(_env_file=None, database_url=url, dev_study_id=study_id)
        app = create_app(settings)
        app.dependency_overrides[get_settings] = lambda: settings
        app.dependency_overrides[cadastre_gateway] = lambda: gateway
        return TestClient(app)

    return make


def test_the_second_request_is_served_from_the_study_cache(client_for, gateway):
    client = client_for()

    first = client.get(f"/api/cadastre/{REFERENCE}")
    second = client.get(f"/api/cadastre/{REFERENCE.lower()}")

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json() == a_property().to_dict()
    assert gateway.fetch.call_count == 1


def test_another_study_does_not_use_the_cache_of_the_first(client_for, gateway):
    client_for(STUDY_A).get(f"/api/cadastre/{REFERENCE}")
    client_for(STUDY_B).get(f"/api/cadastre/{REFERENCE}")

    assert gateway.fetch.call_count == 2


def test_not_found_and_unavailable_are_not_cached(client_for, gateway):
    client = client_for()
    gateway.fetch.side_effect = CadastreNotFound()
    assert client.get(f"/api/cadastre/{REFERENCE}").status_code == 404
    gateway.fetch.side_effect = CadastreUnavailable()
    assert client.get(f"/api/cadastre/{REFERENCE}").status_code == 503
    gateway.fetch.side_effect = None
    gateway.fetch.return_value = a_property()

    assert client.get(f"/api/cadastre/{REFERENCE}").status_code == 200


@pytest.mark.parametrize(
    ("path", "code"),
    [
        ("/api/cadastre/9872023VH5797S", "plot_reference_only"),
        ("/api/cadastre/ABC", "invalid_cadastral_reference"),
        ("/api/cadastre/9872023VH5797S0001W-", "invalid_cadastral_reference"),
        ("/api/cadastre/%20", "cadastral_reference_required"),
    ],
)
def test_an_invalid_reference_is_422_and_the_service_is_not_called(client_for, gateway, path, code):
    response = client_for().get(path)

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == code
    gateway.fetch.assert_not_called()
