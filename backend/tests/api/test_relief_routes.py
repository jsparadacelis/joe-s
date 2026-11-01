"""GET /api/cadastre/{reference}/relief with a simulated use case."""

from contextlib import contextmanager
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import get_settings, relief_unit_of_work
from backend.app.api.main import create_app
from backend.app.external_data.application.get_relief import GetRelief
from backend.app.external_data.domain.cadastral_reference import InvalidCadastralReference
from backend.app.external_data.domain.errors import (
    CadastreUnavailable,
    PlotNotFound,
    ReliefUnavailable,
)
from backend.app.external_data.domain.relief import (
    ElevationGrid,
    Relief,
    ReliefOptions,
    plan_relief_window,
)
from backend.app.shared.config import Settings
from backend.tests.api.auth_support import supabase_client
from backend.tests.external_data.domain.test_plot import (
    PROPERTY_REFERENCE,
    REFERENCE,
    TRIANGLE,
    _plot_from_metres,
)

RELIEF_PATH = f"/api/cadastre/{PROPERTY_REFERENCE}/relief"


def a_relief(options=None):
    options = options or ReliefOptions()
    plot = _plot_from_metres(TRIANGLE)
    plan = plan_relief_window(plot, options)
    cols, rows = plan.window.grid_size
    grid = ElevationGrid(cols, rows, tuple(float(i % 5) for i in range(cols * rows)))
    return Relief(
        REFERENCE, plan.window, grid, plan.outline, plan.clipped, plan.parcel_clipped, 2700.0
    )


@pytest.fixture
def relief():
    return create_autospec(GetRelief, spec_set=True, instance=True)


@pytest.fixture
def client(relief):
    settings = Settings(_env_file=None)
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    contexts = []

    @contextmanager
    def fake_unit(context):
        contexts.append(context)
        yield relief

    app.dependency_overrides[relief_unit_of_work] = lambda: fake_unit
    test_client = TestClient(app)
    test_client.contexts = contexts
    return test_client


def test_relief_answers_200_with_the_documented_shape_in_english_keys(client, relief):
    relief.execute.return_value = a_relief()

    response = client.get(RELIEF_PATH)

    assert response.status_code == 200
    body = response.json()
    assert list(body) == [
        "reference",
        "window",
        "grid",
        "outline",
        "clipped",
        "parcel_clipped",
        "plot_area_m2",
    ]
    assert body == a_relief().to_dict()
    assert body["grid"]["cell_size_m"] == 5
    assert len(client.contexts) == 1


def test_without_query_parameters_the_margin_is_25_and_the_maximum_side_300(client, relief):
    relief.execute.return_value = a_relief()

    client.get(RELIEF_PATH)

    relief.execute.assert_called_once_with(PROPERTY_REFERENCE, ReliefOptions(25, 300))


def test_the_query_parameters_are_the_options_of_the_relief(client, relief):
    relief.execute.return_value = a_relief()

    client.get(RELIEF_PATH, params={"margin": 50, "max_side": 500})

    relief.execute.assert_called_once_with(PROPERTY_REFERENCE, ReliefOptions(50, 500))


def test_one_parameter_may_be_given_without_the_other(client, relief):
    relief.execute.return_value = a_relief()

    client.get(RELIEF_PATH, params={"max_side": 200})

    relief.execute.assert_called_once_with(PROPERTY_REFERENCE, ReliefOptions(25, 200))


def test_a_relief_with_null_cells_and_no_outline_is_valid_json(client, relief):
    base = a_relief()
    cols, rows = base.window.grid_size
    values = (None, *base.grid.values[1:])
    relief.execute.return_value = Relief(
        REFERENCE,
        base.window,
        ElevationGrid(cols, rows, values),
        None,
        True,
        True,
        base.plot_area_m2,
    )

    body = client.get(RELIEF_PATH).json()

    assert body["grid"]["values"][0] is None
    assert body["outline"] is None


@pytest.mark.parametrize(
    ("params", "code", "message"),
    [
        (
            {"margin": 30},
            "invalid_relief_margin",
            "El margen debe ser 0, 10, 25, 50 o 100 metros.",
        ),
        (
            {"margin": -5},
            "invalid_relief_margin",
            "El margen debe ser 0, 10, 25, 50 o 100 metros.",
        ),
        (
            {"max_side": 250},
            "invalid_relief_max_side",
            "El lado máximo debe ser 100, 200, 300 o 500 metros.",
        ),
        (
            {"max_side": 0},
            "invalid_relief_max_side",
            "El lado máximo debe ser 100, 200, 300 o 500 metros.",
        ),
        (
            {"margin": "abc"},
            "invalid_request",
            "La solicitud no es válida. Revisa los datos enviados.",
        ),
        (
            {"max_side": "1.5"},
            "invalid_request",
            "La solicitud no es válida. Revisa los datos enviados.",
        ),
        (
            {"margin": ""},
            "invalid_request",
            "La solicitud no es válida. Revisa los datos enviados.",
        ),
    ],
)
def test_other_options_are_422_and_the_use_case_is_not_called(
    client, relief, params, code, message
):
    response = client.get(RELIEF_PATH, params=params)

    assert response.status_code == 422
    assert response.json() == {"detail": {"code": code, "message": message}}
    relief.execute.assert_not_called()


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
        ReliefUnavailable(),
        503,
        "relief_unavailable",
        "No se pudo obtener el relieve. Puedes seguir sin el visor 3D.",
    ),
]


@pytest.mark.parametrize(("error", "status", "code", "message"), ERRORS)
def test_errors_use_the_detail_code_message_shape(client, relief, error, status, code, message):
    relief.execute.side_effect = error

    response = client.get(RELIEF_PATH)

    assert response.status_code == status
    assert response.json() == {"detail": {"code": code, "message": message}}


def test_the_route_requires_authentication_outside_dev_mode():
    assert supabase_client(None).get(RELIEF_PATH).status_code == 401
