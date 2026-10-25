"""RGB-16 routes against real Postgres: authority, frozen scoring and plan, audit of rejections.

Same names as tests/api/test_start_routes.py; migration 009_project_plans must be applied.
"""

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
WEEKS = [2, 2, 4, 5, 8, 40, 4]
KEYS = ["client_fit", "location", "typology", "budget", "timeline", "source", "probability"]
BODY = {"scale": "medium", "weeks": WEEKS}


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
            "(%s, %s, 'Warehouse (sample)', 0)",
            (STUDY_A, CODE),
        )
        admin.execute(
            "INSERT INTO opportunities (study_id, project_id, client, location, project_type) "
            "SELECT study_id, id, 'Client (sample)', 'Town (sample)', 'industrial' FROM projects"
        )
    return url


@pytest.fixture
def client_for(url):
    def make(study_id=STUDY_A, role="partner"):
        settings = Settings(_env_file=None, database_url=url, dev_study_id=study_id, dev_role=role)
        app = create_app(settings)
        app.dependency_overrides[get_settings] = lambda: settings
        return TestClient(app)

    return make


def rows(url, sql, params=()):
    with psycopg.connect(url, autocommit=True) as admin:
        return admin.execute(sql, params).fetchall()


def score(client, value=3):
    response = client.post(
        f"/api/projects/{CODE}/scoring", json={"ratings": {k: value for k in KEYS}}
    )
    assert response.status_code == 201
    return response.json()


def start(client, body=BODY):
    return client.post(f"/api/projects/{CODE}/start", json=body)


def audit_rows(url):
    return rows(
        url,
        "SELECT entity, entity_id, action, outcome, new_value FROM audit_events "
        "ORDER BY created_at, id",
    )


def nothing_changed(url):
    assert rows(url, "SELECT current_phase FROM projects") == [(0,)]
    assert rows(url, "SELECT count(*) FROM project_plans") == [(0,)]
    assert rows(url, "SELECT count(*) FROM frozen_versions") == [(0,)]
    assert rows(url, "SELECT count(*) FROM promotions") == [(0,)]


def test_start_promotes_to_phase_1_and_freezes_scoring_and_plan(client_for, url):
    client = client_for()
    score(client)

    response = start(client)

    assert response.status_code == 200
    assert response.json() == {
        "code": CODE,
        "action": "promote",
        "previous_phase": 0,
        "current_phase": 1,
        "frozen_version": 1,
        "plan": {
            "project_type": "industrial",
            "scale": "medium",
            "weeks_by_phase": {"1": 2, "2": 2, "3": 4, "4": 5, "5": 8, "6": 40, "7": 4},
            "total": 65,
        },
    }
    assert rows(url, "SELECT current_phase FROM projects") == [(1,)]
    (content,) = rows(url, "SELECT content FROM frozen_versions WHERE phase = 0")[0:1]
    assert content[0]["plan"]["weeks"] == WEEKS
    assert content[0]["scoring"]["score"] == 60.0
    assert content[0]["scoring"]["version"] == 1


def test_get_plan_is_404_before_starting_and_200_after(client_for):
    client = client_for()
    score(client)

    before = client.get(f"/api/projects/{CODE}/plan")
    start(client)
    after = client.get(f"/api/projects/{CODE}/plan")

    assert before.status_code == 404
    assert before.json()["detail"]["code"] == "plan_not_found"
    assert after.status_code == 200
    body = after.json()
    assert body["project_type"] == "industrial"
    assert body["scale"] == "medium"
    assert body["total"] == 65
    assert body["weeks_by_phase"]["6"] == 40
    assert body["confirmed_by"] == "sample-user"
    assert body["confirmed_at"].endswith("Z")


def test_get_plan_of_an_unknown_project_or_another_study_is_404(client_for):
    client = client_for()
    score(client)
    start(client)

    unknown = client.get("/api/projects/PRY-2026-999/plan")
    other_study = client_for(STUDY_B).get(f"/api/projects/{CODE}/plan")

    assert unknown.status_code == 404
    assert unknown.json()["detail"]["code"] == "project_not_found"
    assert other_study.status_code == 404
    assert other_study.json()["detail"]["code"] == "project_not_found"


def test_start_of_an_unknown_project_is_404_and_not_audited(client_for, url):
    response = client_for().post("/api/projects/PRY-2026-999/start", json=BODY)

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "project_not_found"
    assert audit_rows(url) == []


def test_another_study_cannot_start_the_project(client_for, url):
    score(client_for())

    response = client_for(STUDY_B).post(f"/api/projects/{CODE}/start", json=BODY)

    assert response.status_code == 404
    nothing_changed(url)


@pytest.mark.parametrize("role", ["partner", "director"])
def test_partner_and_director_can_start(client_for, role):
    score(client_for())

    assert start(client_for(role=role)).status_code == 200


@pytest.mark.parametrize(
    "role", ["project_director", "technical_lead", "architect", "site_collaborator"]
)
def test_other_roles_get_403_and_leave_only_an_audited_rejection(client_for, url, role):
    score(client_for())
    audited_before = len(audit_rows(url))

    response = start(client_for(role=role))

    assert response.status_code == 403
    detail = response.json()["detail"]
    assert detail["code"] == "no_authority"
    assert detail["allowed"] == ["Socio", "Director"]
    nothing_changed(url)
    assert rows(url, "SELECT count(*) FROM exit_deliverables") == [(0,)]
    assert audit_rows(url)[audited_before:] == [
        ("project", CODE, "start", "rejected", {"error": "no_authority"})
    ]


@pytest.mark.parametrize("role", ["project_director", "architect", "site_collaborator"])
def test_only_partner_or_director_can_discard_with_a_reason(client_for, url, role):
    response = client_for(role=role).post(
        f"/api/projects/{CODE}/do-not-pursue", json={"reason": "Out of scope (sample)"}
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "no_authority"
    assert rows(url, "SELECT count(*) FROM promotions") == [(0,)]


@pytest.mark.parametrize("role", ["partner", "director"])
def test_partner_and_director_can_discard_with_a_reason(client_for, url, role):
    response = client_for(role=role).post(
        f"/api/projects/{CODE}/do-not-pursue", json={"reason": "Out of scope (sample)"}
    )

    assert response.status_code == 200
    assert rows(url, "SELECT action, reason FROM promotions") == [
        ("do_not_pursue", "Out of scope (sample)")
    ]


def test_without_a_saved_scoring_it_is_422_and_audited(client_for, url):
    response = start(client_for())

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "incomplete_deliverable"
    assert detail["missing"] == ["scoring"]
    nothing_changed(url)
    assert audit_rows(url) == [
        ("project", CODE, "start", "rejected", {"error": "incomplete_deliverable"})
    ]


@pytest.mark.parametrize(
    ("body", "code"),
    [
        ({"scale": "huge", "weeks": WEEKS}, "invalid_scale"),
        ({"scale": 2, "weeks": WEEKS}, "invalid_scale"),
        ({"scale": None, "weeks": WEEKS}, "invalid_scale"),
        ({"scale": "medium", "weeks": WEEKS[:6]}, "invalid_weeks"),
        ({"scale": "medium", "weeks": [0] + WEEKS[1:]}, "invalid_weeks"),
        ({"scale": "medium", "weeks": [521] + WEEKS[1:]}, "invalid_weeks"),
        ({"scale": "medium", "weeks": [2.5] + WEEKS[1:]}, "invalid_weeks"),
        ({"scale": "medium", "weeks": "2245840"}, "invalid_weeks"),
        ({"scale": "medium", "weeks": None}, "invalid_weeks"),
    ],
)
def test_invalid_scale_or_weeks_are_422_audited_and_store_nothing(client_for, url, body, code):
    client = client_for()
    score(client)
    audited_before = len(audit_rows(url))

    response = start(client, body)

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == code
    assert response.json()["detail"]["message"]
    nothing_changed(url)
    assert audit_rows(url)[audited_before:] == [
        ("project", CODE, "start", "rejected", {"error": code})
    ]


@pytest.mark.parametrize("body", [{}, {"scale": "medium"}, {"weeks": WEEKS}, [1], None])
def test_a_malformed_body_is_invalid_request(client_for, url, body):
    client = client_for()
    score(client)

    response = start(client, body)

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_request"
    nothing_changed(url)


def test_the_limits_1_and_520_weeks_are_accepted(client_for):
    client = client_for()
    score(client)

    response = start(client, {"scale": "small", "weeks": [1, 520, 1, 520, 1, 520, 1]})

    assert response.status_code == 200
    assert response.json()["plan"]["total"] == 1564


def test_a_second_start_is_409(client_for, url):
    client = client_for()
    score(client)
    start(client)
    audited_before = len(audit_rows(url))

    response = start(client)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "project_not_in_opportunity_phase"
    assert rows(url, "SELECT count(*) FROM project_plans") == [(1,)]
    assert rows(url, "SELECT count(*) FROM frozen_versions") == [(1,)]
    assert audit_rows(url)[audited_before:] == [
        ("project", CODE, "start", "rejected", {"error": "project_not_in_opportunity_phase"})
    ]


def test_a_project_that_already_has_a_plan_is_409(client_for, url):
    client = client_for()
    score(client)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO project_plans (study_id, project_id, project_type, scale, weeks, "
            "confirmed_by) SELECT study_id, id, 'industrial', 'small', %s, 'sample-user' "
            "FROM projects",
            (WEEKS,),
        )

    response = start(client)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "plan_already_confirmed"
    assert rows(url, "SELECT current_phase FROM projects") == [(0,)]
    assert audit_rows(url)[-1] == (
        "project",
        CODE,
        "start",
        "rejected",
        {"error": "plan_already_confirmed"},
    )


def test_a_project_not_in_phase_0_is_409(client_for, url):
    client = client_for()
    score(client)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute("UPDATE projects SET current_phase = 2")

    response = start(client)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "project_not_in_opportunity_phase"
    assert rows(url, "SELECT count(*) FROM project_plans") == [(0,)]


def test_start_audits_the_plan_and_the_promotion(client_for, url):
    client = client_for()
    score(client)

    start(client)

    entries = [(e, i, a, o) for e, i, a, o, _ in audit_rows(url)]
    assert ("project_plan", CODE, "confirm", "ok") in entries
    assert ("project", CODE, "promote", "ok") in entries


def test_the_scoring_is_frozen_after_starting(client_for, url):
    client = client_for()
    first = score(client, 3)
    start(client)

    again = client.post(f"/api/projects/{CODE}/scoring", json={"ratings": {k: 5 for k in KEYS}})
    client.put(
        "/api/settings/scoring",
        json={"weights": {k: 2 for k in KEYS}, "threshold": 90},
    )

    assert again.status_code == 409
    assert again.json()["detail"]["code"] == "not_an_opportunity"
    latest = client.get(f"/api/projects/{CODE}/scoring").json()
    assert (latest["version"], latest["score"], latest["threshold"]) == (
        first["version"],
        first["score"],
        60,
    )
    assert rows(url, "SELECT count(*) FROM opportunity_scorings") == [(1,)]


def test_changing_templates_and_weights_afterwards_does_not_alter_what_was_frozen(client_for, url):
    client = client_for()
    score(client)
    start(client)
    frozen_before = rows(url, "SELECT content FROM frozen_versions")
    plan_before = client.get(f"/api/projects/{CODE}/plan").json()

    assert (
        client.put(
            "/api/settings/plan/templates/industrial", json={"weeks": [9, 9, 9, 9, 9, 9, 9]}
        ).status_code
        == 204
    )
    assert (
        client.put("/api/settings/plan/scale-factors/medium", json={"factor": 3}).status_code == 204
    )
    client.put("/api/settings/scoring", json={"weights": {k: 5 for k in KEYS}, "threshold": 99})

    assert rows(url, "SELECT content FROM frozen_versions") == frozen_before
    assert client.get(f"/api/projects/{CODE}/plan").json() == plan_before
    assert plan_before["weeks_by_phase"]["6"] == 40


def test_the_confirmed_plan_cannot_be_altered_through_sql_by_the_app_role(client_for, url):
    client = client_for()
    score(client)
    start(client)

    with pytest.raises(psycopg.Error):
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute("SET ROLE rgb_app")
            admin.execute("UPDATE project_plans SET scale = 'large'")

    assert rows(url, "SELECT scale FROM project_plans") == [("medium",)]
