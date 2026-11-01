"""GET /api/cadastre/{reference}/plot with a simulated use case: shape, statuses, errors."""

from contextlib import contextmanager
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import get_settings, plot_unit_of_work
from backend.app.api.main import create_app
from backend.app.external_data.application.get_plot_geometry import GetPlotGeometry
from backend.app.external_data.domain.cadastral_reference import InvalidCadastralReference
from backend.app.external_data.domain.errors import CadastreUnavailable, PlotNotFound
from backend.app.shared.config import Settings
from backend.tests.api.auth_support import supabase_client
from backend.tests.external_data.domain.test_plot import PROPERTY_REFERENCE, a_plot


@pytest.fixture
def use_case():
    return create_autospec(GetPlotGeometry, spec_set=True, instance=True)


@pytest.fixture
def client(use_case):
    settings = Settings(_env_file=None)
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    contexts = []

    @contextmanager
    def fake_unit(context):
        contexts.append(context)
        yield use_case

    app.dependency_overrides[plot_unit_of_work] = lambda: fake_unit
    test_client = TestClient(app)
    test_client.contexts = contexts
    return test_client


def test_answers_200_with_the_plot_in_english_keys(client, use_case):
    use_case.execute.return_value = a_plot(cadastral_area_m2=9900)

    response = client.get(f"/api/cadastre/{PROPERTY_REFERENCE}/plot")

    assert response.status_code == 200
    assert response.json() == a_plot(cadastral_area_m2=9900).to_dict()
    body = response.json()
    assert body["geometry"]["type"] == "Polygon"
    assert body["geometry"]["coordinates"][0][0][0] < 0 < body["geometry"]["coordinates"][0][0][1]
    use_case.execute.assert_called_once_with(PROPERTY_REFERENCE)
    assert len(client.contexts) == 1


def test_the_response_has_no_ownership_keys(client, use_case):
    use_case.execute.return_value = a_plot()

    text = client.get(f"/api/cadastre/{PROPERTY_REFERENCE}/plot").text.lower()

    assert not any(word in text for word in ("owner", "holder", "nif", "titular"))


@pytest.mark.parametrize(
    ("error", "status", "code", "message"),
    [
        (
            InvalidCadastralReference(
                "invalid_cadastral_reference", "La referencia catastral tiene 20 caracteres."
            ),
            422,
            "invalid_cadastral_reference",
            "La referencia catastral tiene 20 caracteres.",
        ),
        (
            PlotNotFound(),
            404,
            "plot_not_found",
            "No se encontró la parcela en el Catastro.",
        ),
        (
            CadastreUnavailable(),
            503,
            "cadastre_unavailable",
            "No se pudo consultar el Catastro. Introduce los datos a mano.",
        ),
    ],
)
def test_errors_use_the_detail_code_message_shape(client, use_case, error, status, code, message):
    use_case.execute.side_effect = error

    response = client.get(f"/api/cadastre/{PROPERTY_REFERENCE}/plot")

    assert response.status_code == status
    assert response.json() == {"detail": {"code": code, "message": message}}


def test_the_route_requires_authentication_outside_dev_mode():
    assert supabase_client(None).get(f"/api/cadastre/{PROPERTY_REFERENCE}/plot").status_code == 401
