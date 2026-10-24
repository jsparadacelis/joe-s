"""Pause routes against real Postgres: the full path through RLS, the flag and the portfolio."""

from datetime import datetime, timedelta, timezone

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


def in_days(days):
    return (datetime.now(timezone.utc).date() + timedelta(days=days)).isoformat()


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
            "(%s, %s, 'House (sample)', 2), (%s, 'PRY-2026-002', 'Opportunity (sample)', 0)",
            (STUDY_A, CODE, STUDY_A),
        )
    return url


@pytest.fixture
def client_for(url):
    def make(study_id=STUDY_A, role="project_director"):
        settings = Settings(_env_file=None, database_url=url, dev_study_id=study_id, dev_role=role)
        app = create_app(settings)
        app.dependency_overrides[get_settings] = lambda: settings
        return TestClient(app)

    return make


def test_pause_shows_in_the_portfolio_and_resume_clears_it(client_for):
    client = client_for()
    body = {"reason": "authority_wait", "expected_resumption": in_days(10)}

    paused = client.post(f"/api/projects/{CODE}/pause", json=body)

    assert paused.status_code == 201
    assert paused.json()["phase"] == 2
    entry = {p["code"]: p for p in client.get("/api/portfolio").json()["projects"]}[CODE]
    assert entry["status"] == "paused"
    assert entry["pause"] == {
        "reason": "authority_wait",
        "expected_resumption": in_days(10),
        "overdue": False,
        "days_overdue": 0,
    }
    pauses = client.get(f"/api/projects/{CODE}/pauses").json()
    assert pauses["active"]["id"] == paused.json()["id"]
    assert pauses["history"] == []

    resumed = client.post(f"/api/projects/{CODE}/resume")

    assert resumed.status_code == 200
    assert resumed.json()["resumed_on"] == in_days(0)
    entry = {p["code"]: p for p in client.get("/api/portfolio").json()["projects"]}[CODE]
    assert entry["status"] == "unknown"
    assert entry["pause"] is None
    pauses = client.get(f"/api/projects/{CODE}/pauses").json()
    assert pauses["active"] is None
    assert [p["id"] for p in pauses["history"]] == [paused.json()["id"]]


def test_a_second_pause_is_409_and_resuming_without_pause_is_409(client_for):
    client = client_for()
    body = {"reason": "other", "expected_resumption": in_days(1)}

    assert client.post(f"/api/projects/{CODE}/resume").status_code == 409
    client.post(f"/api/projects/{CODE}/pause", json=body)
    again = client.post(f"/api/projects/{CODE}/pause", json=body)

    assert again.status_code == 409
    assert again.json()["detail"]["code"] == "already_paused"


def test_an_unauthorised_role_gets_403_and_the_attempt_is_audited(client_for, url):
    response = client_for(role="architect").post(
        f"/api/projects/{CODE}/pause", json={"reason": "other", "expected_resumption": in_days(1)}
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "not_allowed"
    with psycopg.connect(url) as admin:
        assert admin.execute("SELECT action, outcome FROM audit_events").fetchall() == [
            ("pause_project", "rejected")
        ]
        assert admin.execute("SELECT count(*) FROM pauses").fetchone() == (0,)


def test_an_opportunity_cannot_be_paused_and_a_bad_date_is_422(client_for):
    client = client_for()

    opportunity = client.post(
        "/api/projects/PRY-2026-002/pause",
        json={"reason": "other", "expected_resumption": in_days(1)},
    )
    past = client.post(
        f"/api/projects/{CODE}/pause",
        json={"reason": "other", "expected_resumption": in_days(-2)},
    )

    assert opportunity.json()["detail"]["code"] == "cannot_pause_opportunity"
    assert past.status_code == 422
    assert past.json()["detail"]["field"] == "expected_resumption"


def test_another_studio_cannot_see_or_pause_the_project(client_for):
    other = client_for(STUDY_B)

    assert other.get(f"/api/projects/{CODE}/pauses").status_code == 404
    assert (
        other.post(
            f"/api/projects/{CODE}/pause",
            json={"reason": "other", "expected_resumption": in_days(1)},
        ).status_code
        == 404
    )
    assert other.post(f"/api/projects/{CODE}/resume").status_code == 404
