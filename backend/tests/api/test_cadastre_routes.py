"""GET /api/cadastre/{reference} with a simulated use case: shape, statuses, Spanish errors."""

from contextlib import contextmanager
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import cadastre_unit_of_work, get_settings
from backend.app.api.main import create_app
from backend.app.external_data.application.get_cadastral_property import GetCadastralProperty
from backend.app.external_data.domain.cadastral_reference import InvalidCadastralReference
from backend.app.external_data.domain.errors import CadastreNotFound, CadastreUnavailable
from backend.app.shared.config import Settings
from backend.tests.external_data.domain.test_cadastral_property import REFERENCE, a_property


@pytest.fixture
def use_case():
    return create_autospec(GetCadastralProperty, spec_set=True, instance=True)


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

    app.dependency_overrides[cadastre_unit_of_work] = lambda: fake_unit
    test_client = TestClient(app)
    test_client.contexts = contexts
    return test_client


def test_answers_200_with_the_model_in_english_keys(client, use_case):
    use_case.execute.return_value = a_property()

    response = client.get(f"/api/cadastre/{REFERENCE}")

    assert response.status_code == 200
    assert response.json() == a_property().to_dict()
    use_case.execute.assert_called_once_with(REFERENCE)
    assert len(client.contexts) == 1


def test_the_response_has_no_ownership_keys(client, use_case):
    use_case.execute.return_value = a_property()

    text = client.get(f"/api/cadastre/{REFERENCE}").text.lower()

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
            InvalidCadastralReference("plot_reference_only", "Es la referencia de la parcela."),
            422,
            "plot_reference_only",
            "Es la referencia de la parcela.",
        ),
        (
            CadastreNotFound(),
            404,
            "cadastral_reference_not_found",
            "No se encontró esa referencia en el Catastro.",
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

    response = client.get(f"/api/cadastre/{REFERENCE}")

    assert response.status_code == status
    assert response.json() == {"detail": {"code": code, "message": message}}


def test_a_reference_with_spaces_in_the_url_is_passed_to_the_use_case_as_is(client, use_case):
    use_case.execute.return_value = a_property()

    client.get("/api/cadastre/9872023VH5797S%200001WX")

    use_case.execute.assert_called_once_with("9872023VH5797S 0001WX")


def test_the_route_requires_authentication_outside_dev_mode():
    from backend.tests.api.auth_support import supabase_client

    assert supabase_client(None).get(f"/api/cadastre/{REFERENCE}").status_code == 401
