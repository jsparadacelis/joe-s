"""Every rejected request answers 422 with `{detail: {code, message}}`, never a 500.

The real service runs here (domain validation included) over simulated ports, so a value that
would overflow the database column must be rejected before reaching the repository.
"""

from contextlib import contextmanager
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import get_settings, plan_unit_of_work
from backend.app.api.main import create_app
from backend.app.audit.domain.ports import AuditLog
from backend.app.opportunity.application.plan_settings import PlanSettingsService
from backend.app.opportunity.domain.ports import PlanSettingsRepository
from backend.app.shared.config import Settings

ORIGIN = "http://localhost:3000"
TEMPLATE_URL = "/api/settings/plan/templates/industrial"
FACTOR_URL = "/api/settings/plan/scale-factors/large"
INVALID_WEEKS_MESSAGE = (
    "Cada plantilla necesita exactamente 7 valores de semanas, enteros y entre 1 y 520."
)
INVALID_FACTOR_MESSAGE = "El factor de escala debe ser un número entre 0,1 y 10."


@pytest.fixture
def repo():
    repo = create_autospec(PlanSettingsRepository, spec_set=True, instance=True)
    repo.get_templates.return_value = {}
    repo.get_scale_factors.return_value = {}
    return repo


@pytest.fixture
def client(repo):
    settings = Settings(_env_file=None)
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    audit_log = create_autospec(AuditLog, spec_set=True, instance=True)

    @contextmanager
    def unit_of_work(context):
        yield PlanSettingsService(repo, audit_log)

    app.dependency_overrides[plan_unit_of_work] = lambda: unit_of_work
    return TestClient(app)


def _put(client, url, content):
    return client.put(
        url,
        content=content,
        headers={"content-type": "application/json", "origin": ORIGIN},
    )


def _seven(first):
    return "[" + ",".join([first] + ["1"] * 6) + "]"


class TestTemplateLimits:
    @pytest.mark.parametrize(
        "first", ["521", "2147483648", "99999999999", "1e21", "1e309", "NaN", "Infinity", "1.5",
                  "true", "null", '"3"', "0", "-1", "[]", "{}"],
    )  # fmt: skip
    def test_out_of_range_or_wrong_typed_weeks_are_422_and_never_reach_the_repository(
        self, client, repo, first
    ):
        response = _put(client, TEMPLATE_URL, '{"weeks": %s}' % _seven(first))

        assert response.status_code == 422
        assert response.json() == {
            "detail": {"code": "invalid_weeks", "message": INVALID_WEEKS_MESSAGE}
        }
        assert response.headers["access-control-allow-origin"] == ORIGIN
        repo.save_template.assert_not_called()

    @pytest.mark.parametrize(
        "weeks", ["[1,2,3]", "[]", "[1,1,1,1,1,1,1,1]", '"1234567"', "null", "7"]
    )
    def test_wrong_length_or_shape_is_422(self, client, repo, weeks):
        response = _put(client, TEMPLATE_URL, '{"weeks": %s}' % weeks)

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_weeks"
        repo.save_template.assert_not_called()

    def test_the_cap_itself_is_accepted(self, client, repo):
        response = _put(client, TEMPLATE_URL, '{"weeks": [520,1,520,1,520,1,520]}')

        assert response.status_code == 204
        repo.save_template.assert_called_once()


class TestFactorLimits:
    @pytest.mark.parametrize(
        "factor",
        ["0.09", "1e-10", "0", "-1", "10.01", "1e309", "-1e309", "NaN", "Infinity", '"NaN"',
         '"abc"', "true", "null", "[1]", "{}", pytest.param('"' + "1" * 5000 + '"', id="huge-string")],
    )  # fmt: skip
    def test_out_of_range_or_wrong_typed_factors_are_422(self, client, repo, factor):
        response = _put(client, FACTOR_URL, '{"factor": %s}' % factor)

        assert response.status_code == 422
        assert response.json() == {
            "detail": {"code": "invalid_factor", "message": INVALID_FACTOR_MESSAGE}
        }
        assert response.headers["access-control-allow-origin"] == ORIGIN
        repo.save_scale_factor.assert_not_called()

    @pytest.mark.parametrize("factor", ["0.1", "10", "1.25", '"1.25"'])
    def test_the_bounds_are_accepted(self, client, repo, factor):
        response = _put(client, FACTOR_URL, '{"factor": %s}' % factor)

        assert response.status_code == 204


class TestMalformedRequests:
    """FastAPI's own validation errors share the `{detail: {code, message}}` shape."""

    @pytest.mark.parametrize(
        ("url", "content"),
        [
            (TEMPLATE_URL, "{}"),
            (TEMPLATE_URL, "not json"),
            (TEMPLATE_URL, ""),
            (TEMPLATE_URL, "[1,2,3,4,5,6,7]"),
            (FACTOR_URL, "{}"),
            (FACTOR_URL, "{"),
            ("/api/settings/plan/templates/castle", '{"weeks": [1,1,1,1,1,1,1]}'),
            ("/api/settings/plan/scale-factors/huge", '{"factor": 1}'),
            # More digits than Python parses into an int: the body cannot be read at all.
            pytest.param(
                TEMPLATE_URL, '{"weeks": [' + "9" * 5000 + ",1,1,1,1,1,1]}", id="huge-int"
            ),
        ],
    )
    def test_are_422_with_a_spanish_message(self, client, url, content):
        response = _put(client, url, content)

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert detail["code"] == "invalid_request"
        assert detail["message"] == "La solicitud no es válida. Revisa los datos enviados."
        assert response.headers["access-control-allow-origin"] == ORIGIN

    def test_query_parameter_errors_use_the_same_shape(self, client):
        response = client.get("/api/plan", params={"project_type": "castle", "scale": "large"})

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_request"
