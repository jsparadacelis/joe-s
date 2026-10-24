from contextlib import contextmanager
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import get_settings, plan_unit_of_work
from backend.app.api.main import create_app
from backend.app.opportunity.application.plan_settings import PlanSettings, PlanSettingsService
from backend.app.opportunity.domain.errors import InvalidFactor, InvalidWeeks
from backend.app.opportunity.domain.plan import (
    DEFAULT_SCALE_FACTORS,
    DEFAULT_TEMPLATES,
    Plan,
    ProjectType,
    Scale,
)
from backend.app.shared.config import Settings


@pytest.fixture
def service():
    return create_autospec(PlanSettingsService, spec_set=True, instance=True)


@pytest.fixture
def client(service):
    app = create_app(Settings(_env_file=None))
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None)

    @contextmanager
    def fake_unit_of_work(context):
        yield service

    app.dependency_overrides[plan_unit_of_work] = lambda: fake_unit_of_work
    return TestClient(app)


class TestGetPlan:
    def test_returns_weeks_by_phase_and_total(self, client, service):
        service.make_plan.return_value = Plan(weeks=(3, 3, 5, 7, 10, 52, 5))

        response = client.get("/api/plan", params={"project_type": "industrial", "scale": "large"})

        assert response.status_code == 200
        assert response.json() == {
            "project_type": "industrial",
            "scale": "large",
            "weeks_by_phase": {"1": 3, "2": 3, "3": 5, "4": 7, "5": 10, "6": 52, "7": 5},
            "total": 85,
        }
        service.make_plan.assert_called_once_with(ProjectType.INDUSTRIAL, Scale.LARGE)

    @pytest.mark.parametrize(
        "params",
        [{"project_type": "castle", "scale": "large"}, {"project_type": "industrial"}],
    )
    def test_unknown_or_missing_parameters_are_422(self, client, params):
        response = client.get("/api/plan", params=params)

        assert response.status_code == 422


class TestSettings:
    def test_lists_templates_and_scale_factors(self, client, service):
        service.get_settings.return_value = PlanSettings(
            templates=dict(DEFAULT_TEMPLATES), scale_factors=dict(DEFAULT_SCALE_FACTORS)
        )

        response = client.get("/api/settings/plan")

        body = response.json()
        assert body["templates"]["industrial"] == [2, 2, 4, 5, 8, 40, 4]
        assert body["scale_factors"] == {"small": 0.8, "medium": 1.0, "large": 1.3}

    def test_updates_a_template(self, client, service):
        response = client.put(
            "/api/settings/plan/templates/industrial", json={"weeks": [3, 3, 3, 3, 3, 3, 3]}
        )

        assert response.status_code == 204
        assert service.update_template.call_args.args[1:] == (
            ProjectType.INDUSTRIAL,
            [3, 3, 3, 3, 3, 3, 3],
        )

    def test_invalid_weeks_are_422_with_a_spanish_message(self, client, service):
        service.update_template.side_effect = InvalidWeeks()

        response = client.put("/api/settings/plan/templates/industrial", json={"weeks": [1]})

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert detail["code"] == "invalid_weeks"
        assert "7" in detail["message"]

    def test_updates_a_scale_factor(self, client, service):
        response = client.put("/api/settings/plan/scale-factors/large", json={"factor": "1.5"})

        assert response.status_code == 204
        assert service.update_scale_factor.call_args.args[1:] == (Scale.LARGE, "1.5")

    def test_invalid_factor_is_422(self, client, service):
        service.update_scale_factor.side_effect = InvalidFactor()

        response = client.put("/api/settings/plan/scale-factors/large", json={"factor": "0"})

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_factor"
