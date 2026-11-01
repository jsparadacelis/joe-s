"""GET /api/projects/{code}/alerts with a simulated use case: shape, statuses, Spanish errors."""

from contextlib import contextmanager
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import get_settings, technical_data_unit_of_work
from backend.app.api.main import create_app
from backend.app.technical_data.application.edit_datum import EditDatum
from backend.app.technical_data.application.get_alerts import AlertsAnswer, GetAlerts
from backend.app.technical_data.application.get_capacity import GetCapacity
from backend.app.technical_data.application.get_technical_data import GetTechnicalData
from backend.app.technical_data.application.restore_datum import RestoreDatum
from backend.app.technical_data.application.use_cases import TechnicalDataUseCases
from backend.app.technical_data.application.verify_all import VerifyAll
from backend.app.technical_data.application.verify_datum import VerifyDatum
from backend.app.technical_data.domain.alerts import Alert, Severity
from backend.app.technical_data.domain.errors import ProjectNotFound
from backend.tests.api.auth_support import dev_settings

URL = "/api/projects/PRY-T-001/alerts"


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


def test_answers_the_alerts_in_english_keys(client, use_cases):
    use_cases.alerts.execute.return_value = AlertsAnswer(
        alerts=[
            Alert(
                code="pre_1980_building",
                severity=Severity.INFO,
                message="La construcción es anterior a 1980 (año 1960).",
                suggestion="Revise la estructura.",
                fields=("year",),
            )
        ]
    )

    response = client.get(URL)

    assert response.status_code == 200
    assert response.json() == {
        "alerts": [
            {
                "code": "pre_1980_building",
                "severity": "info",
                "message": "La construcción es anterior a 1980 (año 1960).",
                "suggestion": "Revise la estructura.",
                "fields": ["year"],
            }
        ]
    }
    (context,) = client.contexts
    use_cases.alerts.execute.assert_called_once_with(context, "PRY-T-001")


def test_no_alerts_is_an_empty_list(client, use_cases):
    use_cases.alerts.execute.return_value = AlertsAnswer()

    assert client.get(URL).json() == {"alerts": []}


def test_an_unknown_project_is_404(client, use_cases):
    use_cases.alerts.execute.return_value = AlertsAnswer(error=ProjectNotFound())

    response = client.get(URL)

    assert response.status_code == 404
    assert response.json() == {
        "detail": {"code": "project_not_found", "message": "No existe ese proyecto."}
    }


@pytest.mark.parametrize("method", ["put", "post", "patch", "delete"])
def test_the_route_is_read_only(client, method):
    assert getattr(client, method)(URL).status_code == 405
