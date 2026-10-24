"""Scoring routes: contract shapes, statuses and Spanish errors (simulated use cases)."""

from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import (
    get_settings,
    scoring_settings_unit_of_work,
    scoring_unit_of_work,
)
from backend.app.api.main import create_app
from backend.app.opportunity.application.scoring import (
    ScoringService,
    ScoringSettingsService,
    ScoringView,
)
from backend.app.opportunity.domain.errors import (
    InvalidRatings,
    InvalidThreshold,
    InvalidWeights,
    NotAnOpportunity,
    ProjectNotFound,
    ScoringNotFound,
)
from backend.app.opportunity.domain.scoring import (
    DEFAULT_WEIGHTS,
    Criterion,
    Recommendation,
    Scoring,
    default_settings,
)
from backend.app.shared.config import Settings

CODE = "PRY-2026-001"
KEYS = [c.value for c in Criterion]
WHEN = datetime(2026, 10, 24, 10, 0, tzinfo=timezone.utc)


def a_scoring(version=1, score="60.0", recommendation=Recommendation.PURSUE):
    return Scoring(
        project_code=CODE,
        version=version,
        ratings={c: 3 for c in Criterion},
        weights=dict(DEFAULT_WEIGHTS),
        threshold=60,
        score=Decimal(score),
        recommendation=recommendation,
        scored_by="demo-user",
        scored_at=WHEN,
    )


@pytest.fixture
def scoring_service():
    return create_autospec(ScoringService, spec_set=True, instance=True)


@pytest.fixture
def settings_service():
    return create_autospec(ScoringSettingsService, spec_set=True, instance=True)


@pytest.fixture
def client(scoring_service, settings_service):
    app = create_app(Settings(_env_file=None))
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None)
    contexts = []

    @contextmanager
    def fake_scoring(context):
        contexts.append(context)
        yield scoring_service

    @contextmanager
    def fake_settings(context):
        contexts.append(context)
        yield settings_service

    app.dependency_overrides[scoring_unit_of_work] = lambda: fake_scoring
    app.dependency_overrides[scoring_settings_unit_of_work] = lambda: fake_settings
    test_client = TestClient(app)
    test_client.contexts = contexts
    return test_client


SCORING_JSON = {
    "project_code": CODE,
    "version": 1,
    "ratings": {k: 3 for k in KEYS},
    "weights": {k: 1 for k in KEYS},
    "threshold": 60,
    "score": 60.0,
    "recommendation": "pursue",
    "scored_by": "demo-user",
    "scored_at": "2026-10-24T10:00:00Z",
}
SETTINGS_BODY = {"weights": {k: 1 for k in KEYS}, "threshold": 60}


class TestGetSettings:
    def test_returns_the_contract_shape(self, client, settings_service):
        settings_service.get_settings.return_value = default_settings()

        response = client.get("/api/settings/scoring")

        assert response.status_code == 200
        assert response.json() == SETTINGS_BODY
        assert list(response.json()["weights"]) == KEYS


class TestPutSettings:
    def test_returns_204_and_passes_the_raw_body(self, client, settings_service):
        response = client.put("/api/settings/scoring", json=SETTINGS_BODY)

        assert response.status_code == 204
        assert response.content == b""
        context, data = settings_service.update.call_args.args
        assert data == SETTINGS_BODY
        assert context is client.contexts[0]

    @pytest.mark.parametrize(
        ("error", "code"),
        [(InvalidWeights(), "invalid_weights"), (InvalidThreshold(), "invalid_threshold")],
    )
    def test_domain_errors_are_422_with_code_and_spanish_message(
        self, client, settings_service, error, code
    ):
        settings_service.update.side_effect = error

        response = client.put("/api/settings/scoring", json=SETTINGS_BODY)

        assert response.status_code == 422
        assert response.json() == {"detail": {"code": code, "message": error.message}}

    @pytest.mark.parametrize("body", [[1, 2], "x", 3, True])
    def test_any_json_body_reaches_the_domain(self, client, settings_service, body):
        response = client.put("/api/settings/scoring", json=body)

        assert response.status_code == 204
        assert settings_service.update.call_args.args[1] == body

    def test_a_json_null_body_reaches_the_domain(self, client, settings_service):
        response = client.put(
            "/api/settings/scoring",
            content=b"null",
            headers={"content-type": "application/json"},
        )

        assert response.status_code == 204
        assert settings_service.update.call_args.args[1] is None

    def test_a_missing_body_is_an_invalid_request(self, client, settings_service):
        # The earlier version of this test sent `json=None`, which the test client turns into
        # NO body at all (not a JSON null): the framework answers 422 `invalid_request`.
        response = client.put("/api/settings/scoring", json=None)

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_request"
        settings_service.update.assert_not_called()


class TestPostScoring:
    def test_returns_201_with_the_contract_shape(self, client, scoring_service):
        scoring_service.score.return_value = a_scoring()
        body = {"ratings": {k: 3 for k in KEYS}}

        response = client.post(f"/api/projects/{CODE}/scoring", json=body)

        assert response.status_code == 201
        assert response.json() == SCORING_JSON
        context, code, data = scoring_service.score.call_args.args
        assert (code, data) == (CODE, body)
        assert context is client.contexts[0]

    def test_a_do_not_pursue_scoring(self, client, scoring_service):
        scoring_service.score.return_value = a_scoring(
            version=2, score="31.4", recommendation=Recommendation.DO_NOT_PURSUE
        )

        response = client.post(f"/api/projects/{CODE}/scoring", json={"ratings": {}})

        assert response.json()["score"] == 31.4
        assert response.json()["recommendation"] == "do_not_pursue"
        assert response.json()["version"] == 2

    def test_decimal_weights_are_numbers(self, client, scoring_service):
        scoring = a_scoring()
        scoring.weights[Criterion.BUDGET] = Decimal("0.25")
        scoring_service.score.return_value = scoring

        response = client.post(f"/api/projects/{CODE}/scoring", json={"ratings": {}})

        assert response.json()["weights"]["budget"] == 0.25
        assert response.json()["weights"]["location"] == 1

    def test_unknown_project_is_404(self, client, scoring_service):
        scoring_service.score.side_effect = ProjectNotFound(CODE)

        response = client.post(f"/api/projects/{CODE}/scoring", json={"ratings": {}})

        assert response.status_code == 404
        assert response.json() == {
            "detail": {"code": "project_not_found", "message": f"No existe el proyecto {CODE}."}
        }

    def test_not_an_opportunity_is_409(self, client, scoring_service):
        scoring_service.score.side_effect = NotAnOpportunity()

        response = client.post(f"/api/projects/{CODE}/scoring", json={"ratings": {}})

        assert response.status_code == 409
        assert response.json() == {
            "detail": {
                "code": "not_an_opportunity",
                "message": "Solo se puede puntuar una oportunidad (fase 0).",
            }
        }

    def test_invalid_ratings_is_422_with_the_field(self, client, scoring_service):
        error = InvalidRatings("budget")
        scoring_service.score.side_effect = error

        response = client.post(f"/api/projects/{CODE}/scoring", json={"ratings": {}})

        assert response.status_code == 422
        assert response.json() == {
            "detail": {"code": "invalid_ratings", "message": error.message, "field": "budget"}
        }

    def test_invalid_ratings_without_field_omits_it(self, client, scoring_service):
        error = InvalidRatings(None)
        scoring_service.score.side_effect = error

        response = client.post(f"/api/projects/{CODE}/scoring", json={"ratings": 3})

        assert response.status_code == 422
        assert response.json() == {"detail": {"code": "invalid_ratings", "message": error.message}}

    def test_a_non_object_body_reaches_the_domain(self, client, scoring_service):
        scoring_service.score.side_effect = InvalidRatings(None)

        response = client.post(f"/api/projects/{CODE}/scoring", json=[1, 2])

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_ratings"
        assert scoring_service.score.call_args.args[2] == [1, 2]


class TestGetScoring:
    def test_returns_the_latest_with_history(self, client, scoring_service):
        scoring_service.read.return_value = ScoringView(
            latest=a_scoring(version=2),
            history=[a_scoring(version=2), a_scoring(version=1, score="40.0")],
        )

        response = client.get(f"/api/projects/{CODE}/scoring")

        assert response.status_code == 200
        assert response.json() == {
            **SCORING_JSON,
            "version": 2,
            "history": [
                {
                    "version": 2,
                    "score": 60.0,
                    "recommendation": "pursue",
                    "scored_at": "2026-10-24T10:00:00Z",
                },
                {
                    "version": 1,
                    "score": 40.0,
                    "recommendation": "pursue",
                    "scored_at": "2026-10-24T10:00:00Z",
                },
            ],
        }
        scoring_service.read.assert_called_once_with(CODE)

    def test_unknown_project_is_404(self, client, scoring_service):
        scoring_service.read.side_effect = ProjectNotFound(CODE)

        response = client.get(f"/api/projects/{CODE}/scoring")

        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "project_not_found"

    def test_without_scoring_is_404_scoring_not_found(self, client, scoring_service):
        scoring_service.read.side_effect = ScoringNotFound()

        response = client.get(f"/api/projects/{CODE}/scoring")

        assert response.status_code == 404
        assert response.json() == {
            "detail": {
                "code": "scoring_not_found",
                "message": "La oportunidad aún no tiene scoring.",
            }
        }
