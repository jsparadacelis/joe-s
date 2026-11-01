"""Alerts route against real Postgres: recalculated on every read, read only, RLS."""

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
CODE = "PRY-T-001"
URL = f"/api/projects/{CODE}/alerts"
TABLES = ("technical_data", "technical_data_queries", "audit_events", "projects", "opportunities")


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
            "(%s, %s, 'House (sample)', 2), (%s, 'PRY-T-002', 'Bare (sample)', 2), "
            "(%s, 'PRY-T-003', 'Other (sample)', 2)",
            (STUDY_A, CODE, STUDY_A, STUDY_B),
        )
        admin.execute(
            "INSERT INTO opportunities (study_id, project_id, client, location, project_type) "
            "SELECT study_id, id, 'Client (sample)', 'Valencia', 'single_family_house' "
            "FROM projects WHERE code = %s",
            (CODE,),
        )
    return url


def client_for(url, study_id=STUDY_A, role="architect"):
    settings = Settings(_env_file=None, database_url=url, dev_study_id=study_id, dev_role=role)
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    return TestClient(app)


def put_data(url, code, **values):
    with psycopg.connect(url, autocommit=True) as admin:
        for field_id, value in values.items():
            admin.execute(
                "INSERT INTO technical_data (study_id, project_id, field_id, value, source) "
                "SELECT study_id, id, %s, %s, 'manual' FROM projects WHERE code = %s "
                "ON CONFLICT (project_id, field_id) DO UPDATE SET value = EXCLUDED.value",
                (field_id, value, code),
            )


def snapshot(url):
    with psycopg.connect(url, autocommit=True) as admin:
        return {
            table: admin.execute(f"SELECT * FROM {table} ORDER BY 1, 2").fetchall()
            for table in TABLES
        }


def codes(response):
    return [a["code"] for a in response.json()["alerts"]]


def test_a_project_without_data_has_no_alerts(url):
    response = client_for(url).get(URL)

    assert response.status_code == 200
    assert response.json() == {"alerts": []}


def test_the_saved_data_and_the_sheet_raise_alerts(url):
    put_data(url, CODE, year="1960", use="Industrial", slope="12", municipality="SEGOVIA (SEGOVIA)")

    response = client_for(url).get(URL)

    assert codes(response) == [
        "use_mismatch",
        "pre_1980_building",
        "steep_slope",
        "municipality_mismatch",
    ]
    assert response.json()["alerts"][2] == {
        "code": "steep_slope",
        "severity": "info",
        "message": "La pendiente del terreno (12 %) supera el 10 %.",
        "suggestion": "Conviene un levantamiento topográfico y estudiar contenciones.",
        "fields": ["slope"],
    }


def test_alerts_disappear_once_the_data_are_fixed(url):
    client = client_for(url)
    put_data(url, CODE, year="1960", cadastralPlotArea="100", polygonPlotArea="120")
    assert codes(client.get(URL)) == ["area_mismatch", "pre_1980_building"]

    put_data(url, CODE, year="1995", polygonPlotArea="101")

    assert codes(client.get(URL)) == []


def test_a_project_without_a_sheet_skips_the_rules_that_need_it(url):
    put_data(url, "PRY-T-002", use="Industrial", municipality="SEGOVIA (SEGOVIA)", year="1950")

    response = client_for(url).get("/api/projects/PRY-T-002/alerts")

    assert codes(response) == ["pre_1980_building"]


def test_reading_alerts_writes_nothing_and_is_not_audited(url):
    put_data(url, CODE, year="1960", use="Industrial", slope="30")
    before = snapshot(url)

    client = client_for(url)
    assert len(client.get(URL).json()["alerts"]) == 3
    client.get(URL)

    assert snapshot(url) == before


def test_any_role_can_read_in_any_phase(url):
    assert client_for(url, role="site_collaborator").get(URL).status_code == 200


def test_unknown_project_and_other_studys_project_are_404(url):
    client = client_for(url)

    assert client.get("/api/projects/PRY-T-999/alerts").status_code == 404
    assert client.get("/api/projects/PRY-T-003/alerts").status_code == 404
    assert client_for(url, study_id=STUDY_B).get(URL).status_code == 404
