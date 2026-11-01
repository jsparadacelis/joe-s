"""GET /api/projects/{code}/capacity with a simulated use case: shape, statuses, Spanish errors."""

from contextlib import contextmanager
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import get_settings, technical_data_unit_of_work
from backend.app.api.main import create_app
from backend.app.technical_data.application.edit_datum import EditDatum
from backend.app.technical_data.application.get_alerts import GetAlerts
from backend.app.technical_data.application.get_capacity import CapacityAnswer, GetCapacity
from backend.app.technical_data.application.get_technical_data import GetTechnicalData
from backend.app.technical_data.application.restore_datum import RestoreDatum
from backend.app.technical_data.application.use_cases import TechnicalDataUseCases
from backend.app.technical_data.application.verify_all import VerifyAll
from backend.app.technical_data.application.verify_datum import VerifyDatum
from backend.app.technical_data.domain.capacity import compute_capacity
from backend.app.technical_data.domain.errors import ProjectNotFound
from backend.tests.api.auth_support import dev_settings

URL = "/api/projects/PRY-T-001/capacity"
FILLED_IN = {
    "cadastralPlotArea": "96",
    "buildability": "1,5",
    "maxOccupancy": "70",
    "floors": "PB+2",
    "builtArea": "60",
    "minPlot": "100",
}


@pytest.fixture
def use_cases():
    return TechnicalDataUseCases(
        get=create_autospec(GetTechnicalData, spec_set=True, instance=True),
        capacity=create_autospec(GetCapacity, spec_set=True, instance=True),
        alerts=create_autospec(GetAlerts, spec_set=True, instance=True),
        edit=create_autospec(EditDatum, spec_set=True, instance=True),
        restore=create_autospec(RestoreDatum, spec_set=True, instance=True),
        verify=create_autospec(VerifyDatum, spec_set=True, instance=True),
        verify_all=create_autospec(VerifyAll, spec_set=True, instance=True),
    )


@pytest.fixture
def client(use_cases):
    settings = dev_settings()
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    contexts = []

    @contextmanager
    def fake_unit(context):
        contexts.append(context)
        yield use_cases

    app.dependency_overrides[technical_data_unit_of_work] = lambda: fake_unit
    test_client = TestClient(app)
    test_client.contexts = contexts
    return test_client


def test_answers_the_capacity_in_english_keys(client, use_cases):
    use_cases.capacity.execute.return_value = CapacityAnswer(result=compute_capacity(FILLED_IN))

    response = client.get(URL)

    assert response.status_code == 200
    assert response.json() == {
        "capacity": {
            "surface": 96.0,
            "buildable_area": 144.0,
            "footprint": 67.2,
            "by_floors": 201.6,
            "maximum": 144.0,
            "limited_by": "buildability",
            "existing": 60.0,
            "existing_share": 41.666666666666664,
            "min_plot": 100.0,
            "meets_min_plot": False,
        },
        "missing": [],
    }
    (context,) = client.contexts
    use_cases.capacity.execute.assert_called_once_with(context, "PRY-T-001")


def test_without_enough_data_it_lists_what_is_missing(client, use_cases):
    use_cases.capacity.execute.return_value = CapacityAnswer(
        result=compute_capacity({"buildability": "2"})
    )

    response = client.get(URL)

    assert response.status_code == 200
    assert response.json() == {
        "capacity": None,
        "missing": ["cadastralPlotArea", "maxOccupancy", "floors"],
    }


def test_optional_data_that_are_unknown_come_back_null(client, use_cases):
    use_cases.capacity.execute.return_value = CapacityAnswer(
        result=compute_capacity({**FILLED_IN, "builtArea": "", "minPlot": ""})
    )

    capacity = client.get(URL).json()["capacity"]

    assert capacity["existing"] is None and capacity["existing_share"] is None
    assert capacity["min_plot"] is None and capacity["meets_min_plot"] is None


def test_an_unknown_project_is_404(client, use_cases):
    use_cases.capacity.execute.return_value = CapacityAnswer(error=ProjectNotFound())

    response = client.get(URL)

    assert response.status_code == 404
    assert response.json() == {
        "detail": {"code": "project_not_found", "message": "No existe ese proyecto."}
    }
