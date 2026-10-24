"""Scoring routes against real Postgres: order of errors, audit, frozen scorings."""

import psycopg
import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import get_settings
from backend.app.api.main import create_app
from backend.app.shared.config import Settings
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
CODE = "PRY-2026-001"
LATER = "PRY-2026-002"
KEYS = ["client_fit", "location", "typology", "budget", "timeline", "source", "probability"]


def ratings(value=3, **overrides):
    return {**{k: value for k in KEYS}, **overrides}


def weights(value=1, **overrides):
    return {**{k: value for k in KEYS}, **overrides}


@pytest.fixture
def url(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO studies (id, name) VALUES (%s, 'A (sample)'), (%s, 'B (sample)')",
            (STUDY_A, STUDY_B),
        )
        admin.execute(
            "INSERT INTO projects (study_id, code, name, current_phase) VALUES "
            "(%s, %s, 'Opportunity (sample)', 0), (%s, %s, 'House (sample)', 2)",
            (STUDY_A, CODE, STUDY_A, LATER),
        )
    return url


@pytest.fixture
def client_for(url):
    def make(study_id=STUDY_A):
        settings = Settings(_env_file=None, database_url=url, dev_study_id=study_id)
        app = create_app(settings)
        app.dependency_overrides[get_settings] = lambda: settings
        return TestClient(app)

    return make


def audit_rows(url):
    with psycopg.connect(url, autocommit=True) as admin:
        return admin.execute(
            "SELECT entity, entity_id, action, outcome, version FROM audit_events "
            "ORDER BY created_at, id"
        ).fetchall()


def test_defaults_then_save_then_read_settings(client_for):
    client = client_for()
    assert client.get("/api/settings/scoring").json() == {"weights": weights(1), "threshold": 60}

    body = {"weights": weights(2, budget=0.25), "threshold": 75}
    assert client.put("/api/settings/scoring", json=body).status_code == 204

    assert client.get("/api/settings/scoring").json() == body
    assert client_for(STUDY_B).get("/api/settings/scoring").json()["threshold"] == 60


@pytest.mark.parametrize(
    ("body", "code"),
    [
        ({"weights": weights(0), "threshold": 60}, "invalid_weights"),
        ({"weights": weights(11), "threshold": 60}, "invalid_weights"),
        ({"weights": weights(1.234), "threshold": 60}, "invalid_weights"),
        ({"weights": weights(True), "threshold": 60}, "invalid_weights"),
        ({"weights": weights("1"), "threshold": 60}, "invalid_weights"),
        ({"weights": weights(1, bonus=1), "threshold": 60}, "invalid_weights"),
        ({"weights": {"client_fit": 1}, "threshold": 60}, "invalid_weights"),
        ({"threshold": 60}, "invalid_weights"),
        ([1], "invalid_weights"),
        ({"weights": weights(1), "threshold": 0}, "invalid_threshold"),
        ({"weights": weights(1), "threshold": 100.5}, "invalid_threshold"),
        ({"weights": weights(1), "threshold": True}, "invalid_threshold"),
        ({"weights": weights(1)}, "invalid_threshold"),
    ],
)
def test_invalid_settings_are_422_and_store_nothing(client_for, url, body, code):
    client = client_for()

    response = client.put("/api/settings/scoring", json=body)

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == code
    assert response.json()["detail"]["message"]
    assert client.get("/api/settings/scoring").json()["threshold"] == 60
    assert audit_rows(url) == []


def test_saving_settings_is_audited(client_for, url):
    client_for().put("/api/settings/scoring", json={"weights": weights(2), "threshold": 70})

    assert audit_rows(url) == [("scoring_settings", "scoring", "update", "ok", None)]


def test_all_threes_scores_60_and_is_audited(client_for, url):
    client = client_for()

    response = client.post(f"/api/projects/{CODE}/scoring", json={"ratings": ratings(3)})

    assert response.status_code == 201
    body = response.json()
    assert body["project_code"] == CODE
    assert (body["version"], body["score"], body["recommendation"]) == (1, 60.0, "pursue")
    assert body["ratings"] == ratings(3)
    assert body["weights"] == weights(1)
    assert body["threshold"] == 60
    assert body["scored_by"]
    assert body["scored_at"].endswith("Z")
    assert audit_rows(url) == [("opportunity_scoring", CODE, "score", "ok", 1)]


def test_error_order_is_404_then_409_then_422(client_for, url):
    client = client_for()

    missing = client.post("/api/projects/PRY-2026-999/scoring", json={"ratings": ratings(9)})
    not_opportunity = client.post(f"/api/projects/{LATER}/scoring", json={"ratings": ratings(9)})
    invalid = client.post(f"/api/projects/{CODE}/scoring", json={"ratings": ratings(9)})

    assert missing.status_code == 404
    assert missing.json()["detail"]["code"] == "project_not_found"
    assert not_opportunity.status_code == 409
    assert not_opportunity.json()["detail"] == {
        "code": "not_an_opportunity",
        "message": "Solo se puede puntuar una oportunidad (fase 0).",
    }
    assert invalid.status_code == 422
    assert invalid.json()["detail"]["code"] == "invalid_ratings"
    assert invalid.json()["detail"]["field"] == "client_fit"
    assert audit_rows(url) == []
    assert client.get(f"/api/projects/{CODE}/scoring").status_code == 404


def test_another_study_gets_404(client_for):
    response = client_for(STUDY_B).post(
        f"/api/projects/{CODE}/scoring", json={"ratings": ratings(3)}
    )

    assert response.status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {"ratings": ratings(3, location=True)},
        {"ratings": ratings(3, location=3.5)},
        {"ratings": ratings(3, location="3")},
        {"ratings": ratings(3, location=None)},
        {"ratings": {k: 3 for k in KEYS[:-1]}},
        {"ratings": ratings(3, bonus=1)},
    ],
)
def test_bad_ratings_are_422(client_for, body):
    response = client_for().post(f"/api/projects/{CODE}/scoring", json=body)

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_ratings"


@pytest.mark.parametrize("body", [{"ratings": [3] * 7}, {"ratings": "x"}, {}, [1], "x", 3])
def test_a_ratings_value_that_is_not_an_object_has_no_field(client_for, body):
    response = client_for().post(f"/api/projects/{CODE}/scoring", json=body)

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_ratings"
    assert "field" not in response.json()["detail"]


def test_changing_the_weights_does_not_change_the_saved_scoring(client_for):
    client = client_for()
    saved = client.post(f"/api/projects/{CODE}/scoring", json={"ratings": ratings(1, budget=5)})
    client.put("/api/settings/scoring", json={"weights": weights(1, budget=9), "threshold": 99})

    read = client.get(f"/api/projects/{CODE}/scoring").json()

    assert read["score"] == saved.json()["score"] == 31.4
    assert read["weights"] == weights(1)
    assert read["threshold"] == 60
    assert read["recommendation"] == "do_not_pursue"
    assert read["scored_at"] == saved.json()["scored_at"]


def test_history_keeps_every_version_newest_first(client_for):
    client = client_for()
    client.post(f"/api/projects/{CODE}/scoring", json={"ratings": ratings(3)})
    client.put("/api/settings/scoring", json={"weights": weights(1, budget=9), "threshold": 30})
    second = client.post(f"/api/projects/{CODE}/scoring", json={"ratings": ratings(1, budget=5)})

    read = client.get(f"/api/projects/{CODE}/scoring").json()

    assert second.json()["version"] == 2
    assert second.json()["weights"]["budget"] == 9
    assert read["version"] == 2
    assert [h["version"] for h in read["history"]] == [2, 1]
    assert read["history"][1]["score"] == 60.0
    assert set(read["history"][0]) == {"version", "score", "recommendation", "scored_at"}


def test_scoring_does_not_change_the_project_phase(client_for, url):
    client_for().post(f"/api/projects/{CODE}/scoring", json={"ratings": ratings(5)})

    with psycopg.connect(url, autocommit=True) as admin:
        assert admin.execute(
            "SELECT current_phase FROM projects WHERE code = %s", (CODE,)
        ).fetchone() == (0,)
