"""GET /api/cadastre/{reference}/terrain and /pv with simulated use cases."""

from contextlib import contextmanager
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import get_settings, pv_unit_of_work, terrain_unit_of_work
from backend.app.api.main import create_app
from backend.app.external_data.application.get_pv_yield import GetPvYield
from backend.app.external_data.application.get_terrain_profile import GetTerrainProfile
from backend.app.external_data.domain.cadastral_reference import InvalidCadastralReference
from backend.app.external_data.domain.errors import (
    CadastreUnavailable,
    ExternalServiceUnavailable,
    PlotNotFound,
)
from backend.app.external_data.domain.pv import PvLocation, PvYield
from backend.app.external_data.domain.terrain import TerrainProfile
from backend.app.shared.config import Settings
from backend.tests.api.auth_support import supabase_client
from backend.tests.external_data.domain.test_plot import PROPERTY_REFERENCE, REFERENCE

TERRAIN = f"/api/cadastre/{PROPERTY_REFERENCE}/terrain"
PV = f"/api/cadastre/{PROPERTY_REFERENCE}/pv"
PROFILE = TerrainProfile(REFERENCE, 33.0, 4.2)
YIELD = PvYield(PvLocation(38.640, 0.039), 1617.61, 35.0, -3.0)


@pytest.fixture
def terrain():
    return create_autospec(GetTerrainProfile, spec_set=True, instance=True)


@pytest.fixture
def pv():
    return create_autospec(GetPvYield, spec_set=True, instance=True)


@pytest.fixture
def client(terrain, pv):
    settings = Settings(_env_file=None)
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    contexts = []

    def unit(use_case):
        @contextmanager
        def fake_unit(context):
            contexts.append(context)
            yield use_case

        return lambda: fake_unit

    app.dependency_overrides[terrain_unit_of_work] = unit(terrain)
    app.dependency_overrides[pv_unit_of_work] = unit(pv)
    test_client = TestClient(app)
    test_client.contexts = contexts
    return test_client


def test_terrain_answers_200_with_the_profile_in_english_keys(client, terrain):
    terrain.execute.return_value = PROFILE

    response = client.get(TERRAIN)

    assert response.status_code == 200
    assert response.json() == {
        "altitude_m": 33.0,
        "slope_pct": 4.2,
        "slope_category": "Suave (3–10 %)",
        "estimated": True,
    }
    terrain.execute.assert_called_once_with(PROPERTY_REFERENCE)
    assert len(client.contexts) == 1


def test_terrain_without_a_slope_says_so_with_nulls(client, terrain):
    terrain.execute.return_value = TerrainProfile(REFERENCE, 33.0, None)

    body = client.get(TERRAIN).json()

    assert body["slope_pct"] is None and body["slope_category"] is None


def test_pv_answers_200_with_the_yield_and_its_assumptions(client, pv):
    pv.execute.return_value = YIELD

    response = client.get(PV)

    assert response.status_code == 200
    assert response.json() == {
        "annual_kwh_per_kwp": 1617.61,
        "assumptions": {
            "peak_power_kwp": 1,
            "system_loss_pct": 14,
            "optimal_angles": True,
            "slope_deg": 35.0,
            "azimuth_deg": -3.0,
        },
    }
    pv.execute.assert_called_once_with(PROPERTY_REFERENCE)


ERRORS = [
    (
        InvalidCadastralReference(
            "invalid_cadastral_reference", "La referencia catastral tiene 20 caracteres."
        ),
        422,
        "invalid_cadastral_reference",
        "La referencia catastral tiene 20 caracteres.",
    ),
    (PlotNotFound(), 404, "plot_not_found", "No se encontró la parcela en el Catastro."),
    (
        CadastreUnavailable(),
        503,
        "cadastre_unavailable",
        "No se pudo consultar el Catastro. Introduce los datos a mano.",
    ),
    (
        ExternalServiceUnavailable(),
        503,
        "external_service_unavailable",
        "No se pudo consultar el servicio externo. Introduce el dato a mano.",
    ),
]


@pytest.mark.parametrize(("error", "status", "code", "message"), ERRORS)
@pytest.mark.parametrize("path", ["terrain", "pv"])
def test_errors_use_the_detail_code_message_shape(
    client, terrain, pv, path, error, status, code, message
):
    {"terrain": terrain, "pv": pv}[path].execute.side_effect = error

    response = client.get(f"/api/cadastre/{PROPERTY_REFERENCE}/{path}")

    assert response.status_code == status
    assert response.json() == {"detail": {"code": code, "message": message}}


@pytest.mark.parametrize("path", [TERRAIN, PV])
def test_the_routes_require_authentication_outside_dev_mode(path):
    assert supabase_client(None).get(path).status_code == 401
