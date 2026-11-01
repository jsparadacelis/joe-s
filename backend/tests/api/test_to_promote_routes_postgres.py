"""GET /api/to-promote on real Postgres: order, counter, can_promote by role, RLS, read only,
and the fictitious demo study as sample data."""

from collections import Counter

import psycopg
import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import get_settings
from backend.app.api.main import create_app
from backend.app.shared.config import Settings
from backend.app.shared.demo_data import DEMO_STUDY_ID
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.shared.seed_demo import seed_demo

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
URL = "/api/to-promote"
TABLES = (
    "projects",
    "exit_deliverables",
    "promotions",
    "frozen_versions",
    "audit_events",
    "pauses",
    "opportunity_scorings",
)


def add_project(admin, study, code, phase, created="2026-09-01T10:00:00+00", paused=False):
    admin.execute(
        "INSERT INTO projects (study_id, code, name, current_phase, paused, created_at) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (study, code, f"{code} (sample)", phase, paused, created),
    )
    admin.execute(
        "INSERT INTO opportunities (study_id, project_id, client, location, project_type) "
        "SELECT study_id, id, 'Client (sample)', 'Valencia', 'single_family_house' "
        "FROM projects WHERE code = %s AND study_id = %s",
        (code, study),
    )


def score(admin, code):
    admin.execute(
        "INSERT INTO opportunity_scorings (study_id, project_id, version, ratings, weights, "
        "threshold, score, recommendation, scored_by) SELECT study_id, id, 1, '{}', '{}', 60, "
        "70, 'pursue', 'user-1' FROM projects WHERE code = %s",
        (code,),
    )


def finalize(admin, code, phase):
    admin.execute(
        "INSERT INTO exit_deliverables (study_id, project_id, phase, complete, approved) "
        "SELECT study_id, id, %s, true, true FROM projects WHERE code = %s",
        (phase, code),
    )


@pytest.fixture
def url(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO studies (id, name) VALUES (%s, 'A (sample)'), (%s, 'B (sample)')",
            (STUDY_A, STUDY_B),
        )
        add_project(admin, STUDY_A, "P-READY-NEW", 3, created="2026-10-20T10:00:00+00")
        add_project(admin, STUDY_A, "P-READY-OLD", 3, created="2026-08-01T10:00:00+00")
        add_project(admin, STUDY_A, "P-SCORED", 0, created="2026-09-10T10:00:00+00")
        add_project(admin, STUDY_A, "P-OPEN", 0, created="2026-09-05T10:00:00+00")
        add_project(admin, STUDY_A, "P-PAUSED", 3, paused=True)
        add_project(admin, STUDY_A, "P-CLOSED", 7)
        add_project(admin, STUDY_B, "P-OTHER", 0)
        for code in ("P-READY-NEW", "P-READY-OLD", "P-PAUSED"):
            finalize(admin, code, 3)
        score(admin, "P-SCORED")
        admin.execute(
            "INSERT INTO pauses (study_id, project_id, phase, reason, started_on, "
            "expected_resumption, opened_by) SELECT study_id, id, 3, 'client_wait', "
            "'2026-10-20', '2026-11-20', 'user-1' FROM projects WHERE code = 'P-PAUSED'"
        )
    return url


def client_for(url, study_id=STUDY_A, role="partner", qualifications=()):
    settings = Settings(
        _env_file=None,
        database_url=url,
        dev_study_id=study_id,
        dev_role=role,
        dev_qualifications=list(qualifications),
    )
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    return TestClient(app)


def snapshot(url):
    with psycopg.connect(url, autocommit=True) as admin:
        return {
            table: admin.execute(f"SELECT * FROM {table} ORDER BY 1").fetchall() for table in TABLES
        }


def test_ready_first_then_in_progress_then_blocked_oldest_first_inside_each_group(url):
    body = client_for(url).get(URL).json()

    codes = [p["code"] for p in body["projects"]]
    assert codes == ["P-READY-OLD", "P-SCORED", "P-READY-NEW", "P-OPEN", "P-PAUSED"]


def test_the_counter_counts_the_ready_ones(url):
    assert client_for(url).get(URL).json()["ready_count"] == 3


def test_closed_projects_and_other_studios_are_not_listed(url):
    codes = [p["code"] for p in client_for(url).get(URL).json()["projects"]]

    assert "P-CLOSED" not in codes
    assert "P-OTHER" not in codes


def test_another_study_sees_only_its_own(url):
    body = client_for(url, STUDY_B).get(URL).json()

    assert [p["code"] for p in body["projects"]] == ["P-OTHER"]
    assert body["ready_count"] == 0


def test_each_row_has_the_contract_fields_in_spanish(url):
    projects = {p["code"]: p for p in client_for(url).get(URL).json()["projects"]}

    assert projects["P-OPEN"] == {
        "code": "P-OPEN",
        "name": "P-OPEN (sample)",
        "phase": 0,
        "phase_name": "Oportunidad",
        "deliverable": (
            "Scoring (7 criterios de 1 a 5, nota sobre 100, umbral) + tipología y escala "
            "→ plan de semanas"
        ),
        "state": "in_progress",
        "reason": "Falta: Scoring de la oportunidad.",
        "promoter": "Socio o director",
        "can_promote": True,
    }
    assert projects["P-PAUSED"]["reason"] == "En pausa; reanudación prevista el 20/11/2026."
    assert projects["P-READY-OLD"]["reason"] is None
    assert projects["P-READY-OLD"]["promoter"] == "Director de proyecto"


def test_can_promote_follows_the_role(url):
    def can(role, qualifications=()):
        body = client_for(url, role=role, qualifications=qualifications).get(URL).json()
        return {p["code"]: p["can_promote"] for p in body["projects"]}

    partner = can("partner")
    assert partner["P-OPEN"] is True and partner["P-READY-OLD"] is False
    director = can("project_director")
    assert director["P-OPEN"] is False and director["P-READY-OLD"] is True
    architect = can("architect")
    assert set(architect.values()) == {False}


def test_reading_writes_nothing(url):
    before = snapshot(url)

    client_for(url).get(URL)

    assert snapshot(url) == before


class TestWithTheDemoStudy:
    @pytest.fixture
    def demo(self, url):
        seed_demo(url)
        return url

    def test_lists_the_eight_demo_projects_with_the_expected_states(self, demo):
        body = client_for(demo, DEMO_STUDY_ID).get(URL).json()

        assert len(body["projects"]) == 8
        assert Counter(p["state"] for p in body["projects"]) == {
            "ready": 2,
            "in_progress": 4,
            "blocked": 2,
        }
        assert body["ready_count"] == 2

    def test_the_ready_ones_come_first_and_the_blocked_last(self, demo):
        states = [p["state"] for p in client_for(demo, DEMO_STUDY_ID).get(URL).json()["projects"]]

        assert states == sorted(states, key=["ready", "in_progress", "blocked"].index)

    def test_the_paused_demo_projects_say_when_they_resume(self, demo):
        projects = client_for(demo, DEMO_STUDY_ID).get(URL).json()["projects"]
        blocked = [p for p in projects if p["state"] == "blocked"]

        assert all(p["reason"].startswith("En pausa; reanudación prevista el ") for p in blocked)
        assert any(p["reason"].endswith("(vencida).") for p in blocked)

    def test_can_promote_for_a_partner_covers_the_management_phases_only(self, demo):
        projects = client_for(demo, DEMO_STUDY_ID, "partner").get(URL).json()["projects"]

        assert {p["phase"] for p in projects if p["can_promote"]} == {0, 1}

    def test_the_dev_study_sees_none_of_it(self, demo):
        dev_study = Settings(_env_file=None).dev_study_id

        assert client_for(demo, dev_study).get(URL).json() == {"ready_count": 0, "projects": []}


def test_phase_one_and_two_projects_are_judged_with_their_sheet_and_brief(url):
    import json

    from backend.tests.to_promote.support import COMPLETE_BRIEF, COMPLETE_MANUAL_SHEET

    with psycopg.connect(url, autocommit=True) as admin:
        add_project(admin, STUDY_A, "P-SHEET", 1)
        add_project(admin, STUDY_A, "P-BRIEF", 2)
        add_project(admin, STUDY_A, "P-BRIEF-OPEN", 2)
        admin.execute(
            "INSERT INTO project_plans (study_id, project_id, project_type, scale, weeks, "
            "confirmed_by) SELECT study_id, id, 'single_family_house', 'medium', "
            "ARRAY[2,3,4,5,6,7,8]::smallint[], 'user-1' FROM projects WHERE code = 'P-SHEET'"
        )
        for code, phase, content in (
            ("P-SHEET", 1, COMPLETE_MANUAL_SHEET),
            ("P-BRIEF", 2, {"brief": COMPLETE_BRIEF}),
        ):
            admin.execute(
                "INSERT INTO exit_deliverables (study_id, project_id, phase, content) "
                "SELECT study_id, id, %s, %s FROM projects WHERE code = %s",
                (phase, json.dumps(content), code),
            )
        admin.execute(
            "INSERT INTO technical_data (study_id, project_id, field_id, value, source) "
            "SELECT study_id, id, 'year', '1990', 'manual' FROM projects WHERE code = 'P-BRIEF'"
        )

    projects = {p["code"]: p for p in client_for(url).get(URL).json()["projects"]}

    assert projects["P-SHEET"]["state"] == "ready"
    assert projects["P-BRIEF"]["state"] == "ready"
    assert projects["P-BRIEF-OPEN"]["state"] == "in_progress"
    assert (
        projects["P-BRIEF-OPEN"]["reason"]
        == "Falta: Necesidades, Programa, Condicionantes y 4 más."
    )
