"""PUT /sheet of RGB-17b against real Postgres: roles, persistence, audit and the phase."""

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
URL = f"/api/projects/{CODE}/sheet"
WEEKS = [2, 2, 4, 5, 8, 40, 4]
PLAN = {"project_type": "rehabilitation", "scale": "large", "weeks": [3, 4, 6, 8, 9, 40, 5]}


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
            "(%s, %s, 'Warehouse (sample)', 1)",
            (STUDY_A, CODE),
        )
        admin.execute(
            "INSERT INTO opportunities (study_id, project_id, client, location, project_type) "
            "SELECT study_id, id, 'Client (sample)', 'Town (sample)', 'industrial' FROM projects"
        )
        admin.execute(
            "INSERT INTO project_plans (study_id, project_id, project_type, scale, weeks, "
            "confirmed_by) SELECT study_id, id, 'industrial', 'medium', %s, 'sample-user' "
            "FROM projects",
            (WEEKS,),
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


def values(body):
    return {f["field"]: f["value"] for b in body["blocks"] for f in b["fields"]}


def audit_rows(url):
    return rows(
        url,
        "SELECT entity, entity_id, action, outcome, old_value, new_value FROM audit_events "
        "ORDER BY created_at, id",
    )


def test_put_saves_and_the_get_returns_the_same_sheet(client_for):
    client = client_for()

    put = client.put(URL, json={"fields": {"sponsor": "Sponsor (sample)", "contact": " Ana "}})

    assert put.status_code == 200
    assert values(put.json())["sponsor"] == "Sponsor (sample)"
    assert values(put.json())["contact"] == "Ana"
    assert client.get(URL).json() == put.json()


def test_successive_saves_merge_and_blank_deletes(client_for, url):
    client = client_for()
    client.put(URL, json={"fields": {"sponsor": "Sponsor (sample)", "team": "Team (sample)"}})

    body = client.put(URL, json={"fields": {"team": "", "contact": "Ana"}}).json()

    assert values(body)["sponsor"] == "Sponsor (sample)"
    assert values(body)["team"] is None
    assert rows(url, "SELECT content FROM exit_deliverables WHERE phase = 1") == [
        ({"sponsor": "Sponsor (sample)", "contact": "Ana"},)
    ]


def test_completion_is_updated_when_saving(client_for):
    client = client_for()
    before = client.get(URL).json()["completion"]

    after = client.put(URL, json={"fields": {"sponsor": "Sponsor (sample)"}}).json()["completion"]

    assert after["filled"] == before["filled"] + 1


def test_the_plan_wins_over_the_baseline_and_the_baseline_is_untouched(client_for, url):
    client = client_for()

    body = client.put(URL, json={"plan": PLAN}).json()

    found = values(body)
    assert (found["project_type"], found["scale"]) == ("rehabilitation", "large")
    assert found["confirmed_plan"]["total"] == 75
    assert rows(url, "SELECT project_type, scale, weeks FROM project_plans") == [
        ("industrial", "medium", WEEKS)
    ]
    assert rows(url, "SELECT project_type FROM opportunities") == [("industrial",)]
    assert client.get(URL).json() == body


def test_every_save_is_audited_with_previous_and_new_values(client_for, url):
    client = client_for()
    client.put(URL, json={"fields": {"sponsor": "First"}})

    client.put(URL, json={"fields": {"sponsor": "Second"}, "plan": PLAN})

    events = audit_rows(url)
    assert [(e[0], e[1], e[2], e[3]) for e in events] == [
        ("project_sheet", CODE, "update", "ok"),
        ("project_sheet", CODE, "update", "ok"),
        ("project_sheet", CODE, "recalculate_plan", "ok"),
    ]
    assert events[1][4:] == ({"sponsor": "First"}, {"sponsor": "Second"})
    assert events[2][4]["total"] == 65
    assert events[2][5]["total"] == 75


def test_the_phase_never_changes(client_for, url):
    client_for().put(URL, json={"fields": {"sponsor": "x"}, "plan": PLAN})

    assert rows(url, "SELECT current_phase FROM projects") == [(1,)]
    assert rows(url, "SELECT count(*) FROM promotions") == [(0,)]
    assert rows(url, "SELECT count(*) FROM frozen_versions") == [(0,)]


def test_a_role_without_authority_gets_403_and_it_is_audited(client_for, url):
    response = client_for(role="project_director").put(URL, json={"fields": {"sponsor": "x"}})

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "no_authority"
    assert rows(url, "SELECT count(*) FROM exit_deliverables") == [(0,)]
    assert [(e[2], e[3], e[5]) for e in audit_rows(url)] == [
        ("update", "rejected", {"error": "no_authority"})
    ]


@pytest.mark.parametrize("phase", [0, 2])
def test_outside_phase_1_it_is_409_and_audited(client_for, url, phase):
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute("UPDATE projects SET current_phase = %s", (phase,))

    response = client_for().put(URL, json={"fields": {"sponsor": "x"}})

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "sheet_not_editable"
    assert rows(url, "SELECT count(*) FROM exit_deliverables") == [(0,)]
    assert [(e[2], e[3], e[4], e[5]) for e in audit_rows(url)] == [
        ("update", "rejected", {"phase": phase}, {"error": "sheet_not_editable"})
    ]


@pytest.mark.parametrize(
    "body, code, field",
    [
        ({"fields": {"contract_signed_on": "31/12/2026"}}, "invalid_field", "contract_signed_on"),
        ({"fields": {"code": "PRY-X"}}, "unknown_field", "code"),
        ({"plan": {**PLAN, "weeks": [1]}}, "invalid_weeks", None),
        ({"plan": {**PLAN, "scale": "huge"}}, "invalid_scale", None),
        ({"plan": {**PLAN, "project_type": "x"}}, "invalid_project_type", None),
        ({}, "invalid_request", None),
    ],
)
def test_invalid_input_is_422_audited_and_saves_nothing(client_for, url, body, code, field):
    response = client_for().put(URL, json=body)

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == code
    assert detail.get("field") == field
    assert rows(url, "SELECT count(*) FROM exit_deliverables") == [(0,)]
    assert [(e[2], e[3], e[5]) for e in audit_rows(url)] == [
        ("update", "rejected", {"error": code})
    ]


def test_unknown_project_is_404(client_for):
    response = client_for().put("/api/projects/PRY-2026-999/sheet", json={"fields": {"team": "x"}})

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "project_not_found"


def test_another_study_sees_a_404_and_changes_nothing(client_for, url):
    response = client_for(STUDY_B).put(URL, json={"fields": {"sponsor": "Intruder"}})

    assert response.status_code == 404
    assert rows(url, "SELECT count(*) FROM exit_deliverables") == [(0,)]


@pytest.mark.parametrize("raw", ['"a\\u0000b"', '"x\\ud800"'])
def test_unstorable_characters_are_422_audited_and_never_reach_the_database(client_for, url, raw):
    body = ('{"fields": {"sponsor": ' + raw + "}}").encode()

    response = client_for().put(URL, content=body, headers={"content-type": "application/json"})

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert (detail["code"], detail["field"]) == ("invalid_field", "sponsor")
    assert "contiene caracteres no permitidos" in detail["message"]
    assert rows(url, "SELECT count(*) FROM exit_deliverables") == [(0,)]
    assert [(e[2], e[3], e[5]) for e in audit_rows(url)] == [
        ("update", "rejected", {"error": "invalid_field"})
    ]
