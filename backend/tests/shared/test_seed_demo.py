"""The demo seed on real Postgres: counts, idempotency, isolation, coherence and safety."""

import json
from collections import Counter

import psycopg
import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import get_settings
from backend.app.api.main import create_app
from backend.app.external_data.domain.cadastral_reference import validate_cadastral_reference
from backend.app.shared import seed_demo as seed_module
from backend.app.shared.config import Settings
from backend.app.shared.demo_data import (
    DEMO_STUDY_ID,
    DEMO_STUDY_NAME,
    MEMBERS,
    PROJECTS,
    SEED_USER,
    is_fictitious_reference,
)
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.shared.seed_demo import DemoSeedForbidden, seed_demo
from backend.app.shared.seed_dev import seed_dev_study

pytestmark = pytest.mark.integration

DEV_STUDY_ID = Settings(_env_file=None).dev_study_id


@pytest.fixture
def url(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    return url


@pytest.fixture
def seeded(url):
    seed_demo(url)
    return url


def rows(url, sql, params=(), study_id=DEMO_STUDY_ID):
    """Read as the application does: role `rgb_app` and the study set, so RLS applies."""
    with psycopg.connect(url) as conn:
        conn.execute("SET LOCAL ROLE rgb_app")
        conn.execute("SELECT set_config('app.study_id', %s, true)", (study_id,))
        return conn.execute(sql, params).fetchall()


def admin_rows(url, sql, params=()):
    with psycopg.connect(url, autocommit=True) as conn:
        return conn.execute(sql, params).fetchall()


def phases(url):
    return Counter(r[0] for r in rows(url, "SELECT current_phase FROM projects"))


class TestCounts:
    def test_creates_one_study_with_the_demo_id_and_name(self, seeded):
        assert rows(seeded, "SELECT id::text, name FROM studies") == [
            (DEMO_STUDY_ID, DEMO_STUDY_NAME)
        ]

    def test_creates_nine_active_members_with_made_up_user_ids(self, seeded):
        members = rows(seeded, "SELECT email, role, status, user_id FROM study_members")

        assert len(members) == 9
        assert {m[2] for m in members} == {"active"}
        assert sorted(m[3] for m in members) == sorted(m.user_id for m in MEMBERS)

    def test_members_hold_the_roles_and_qualifications_of_the_prd(self, seeded):
        members = rows(seeded, "SELECT role, qualifications FROM study_members")

        assert {m[0] for m in members} == {
            "partner",
            "director",
            "project_director",
            "technical_lead",
            "architect",
            "site_collaborator",
            "administration",
        }
        assert {q for m in members for q in m[1]} == {
            "licensed_signatory",
            "site_management",
            "sponsor",
        }

    def test_creates_eight_projects_with_at_least_one_in_each_phase_zero_to_six(self, seeded):
        found = phases(seeded)

        assert sum(found.values()) == 8
        assert set(found) == {0, 1, 2, 3, 4, 5, 6}

    def test_each_project_ends_in_its_target_phase(self, seeded):
        found = dict(rows(seeded, "SELECT name, current_phase FROM projects"))

        assert found == {p.name: p.target_phase for p in PROJECTS}

    def test_writes_nothing_outside_the_demo_study(self, seeded):
        others = admin_rows(
            seeded,
            "SELECT (SELECT count(*) FROM audit_events WHERE study_id <> %(s)s::uuid) "
            "+ (SELECT count(*) FROM projects WHERE study_id <> %(s)s::uuid) "
            "+ (SELECT count(*) FROM study_members WHERE study_id <> %(s)s::uuid) "
            "+ (SELECT count(*) FROM studies WHERE id <> %(s)s::uuid)",
            {"s": DEMO_STUDY_ID},
        )

        assert others == [(0,)]


class TestIdempotency:
    def snapshot(self, url):
        tables = (
            "studies",
            "study_members",
            "projects",
            "opportunities",
            "opportunity_scorings",
            "project_plans",
            "exit_deliverables",
            "frozen_versions",
            "promotions",
            "pauses",
            "project_members",
            "technical_data",
            "technical_data_queries",
            "audit_events",
        )
        return {t: admin_rows(url, f"SELECT count(*) FROM {t}")[0][0] for t in tables}

    def test_a_second_run_creates_nothing_and_says_so(self, url):
        first = seed_demo(url)
        before = self.snapshot(url)

        second = seed_demo(url)

        assert first.created is True
        assert second.created is False
        assert self.snapshot(url) == before

    def test_the_second_run_keeps_the_same_projects(self, url):
        seed_demo(url)
        before = rows(url, "SELECT id::text, code, name, current_phase FROM projects ORDER BY code")

        seed_demo(url)

        assert (
            rows(url, "SELECT id::text, code, name, current_phase FROM projects ORDER BY code")
            == before
        )

    def test_a_failure_halfway_leaves_nothing_behind_and_a_retry_succeeds(self, url, monkeypatch):
        def boom(*args, **kwargs):
            raise RuntimeError("simulated failure")

        monkeypatch.setattr(seed_module, "_advance_project", boom)
        with pytest.raises(RuntimeError):
            seed_demo(url)
        assert admin_rows(url, "SELECT count(*) FROM studies") == [(0,)]
        monkeypatch.undo()

        assert seed_demo(url).created is True
        assert sum(phases(url).values()) == 8


class TestIsolationAndSafety:
    def test_the_dev_study_is_untouched_and_sees_nothing_of_the_demo(self, url):
        seed_dev_study(url, DEV_STUDY_ID)
        before = admin_rows(url, "SELECT id::text, name FROM studies")

        seed_demo(url)

        assert rows(url, "SELECT id::text FROM studies", study_id=DEV_STUDY_ID) == [(DEV_STUDY_ID,)]
        for table in ("projects", "study_members", "audit_events", "technical_data"):
            assert rows(url, f"SELECT 1 FROM {table}", study_id=DEV_STUDY_ID) == []
        after = admin_rows(url, "SELECT id::text, name FROM studies")
        assert sorted(after) == sorted(before + [(DEMO_STUDY_ID, DEMO_STUDY_NAME)])

    def test_another_study_cannot_see_any_demo_row(self, seeded):
        other = "99999999-9999-9999-9999-999999999999"
        for table in ("studies", "projects", "study_members", "audit_events", "project_members"):
            assert rows(seeded, f"SELECT 1 FROM {table}", study_id=other) == []

    def test_refuses_a_study_with_the_demo_id_but_another_name(self, url):
        with psycopg.connect(url, autocommit=True) as conn:
            conn.execute(
                "INSERT INTO studies (id, name) VALUES (%s, 'Estudio real')", (DEMO_STUDY_ID,)
            )

        with pytest.raises(DemoSeedForbidden):
            seed_demo(url)

        assert admin_rows(url, "SELECT count(*) FROM projects") == [(0,)]

    def test_every_email_is_example_com(self, seeded):
        emails = [r[0] for r in rows(seeded, "SELECT email FROM study_members")]

        assert emails and all(e.endswith("@example.com") for e in emails)

    def test_the_audit_names_the_seed_never_a_person(self, seeded):
        users = {r[0] for r in rows(seeded, "SELECT DISTINCT user_id FROM audit_events")}
        members = {m.user_id for m in MEMBERS}

        assert users == {SEED_USER}
        assert not users & members

    def test_every_recorded_actor_is_the_seed(self, seeded):
        queries = {
            "promotions": "SELECT DISTINCT user_id FROM promotions",
            "frozen_versions": "SELECT DISTINCT frozen_by FROM frozen_versions",
            "opportunity_scorings": "SELECT DISTINCT scored_by FROM opportunity_scorings",
            "project_plans": "SELECT DISTINCT confirmed_by FROM project_plans",
            "pauses": "SELECT opened_by FROM pauses UNION SELECT closed_by FROM pauses "
            "WHERE closed_by IS NOT NULL",
            "project_members": "SELECT DISTINCT assigned_by FROM project_members",
            "study_members": "SELECT DISTINCT invited_by FROM study_members",
        }
        for table, sql in queries.items():
            assert {r[0] for r in rows(seeded, sql)} == {SEED_USER}, table

    def test_no_audited_attempt_was_rejected(self, seeded):
        assert rows(seeded, "SELECT count(*) FROM audit_events WHERE outcome = 'rejected'") == [
            (0,)
        ]

    def test_the_rls_check_still_finds_no_unprotected_table(self, seeded):
        assert admin_rows(seeded, "SELECT * FROM tables_without_rls()") == []


class TestCadastralReferences:
    def references(self, url):
        queried = [
            r[0] for r in rows(url, "SELECT cadastral_reference FROM technical_data_queries")
        ]
        sheets = [
            r[0]["cadastral_reference"]
            for r in rows(
                url,
                "SELECT content FROM exit_deliverables WHERE phase = 1 AND content ? 'cadastral_reference'",
            )
        ]
        return queried, sheets

    def test_are_valid_but_marked_as_fictitious(self, seeded):
        queried, sheets = self.references(seeded)

        assert queried and sheets
        for reference in queried + sheets:
            assert validate_cadastral_reference(reference) == reference
            assert is_fictitious_reference(reference)

    def test_the_frozen_sheets_carry_only_marked_references_and_no_owner_data(self, seeded):
        frozen = rows(seeded, "SELECT content::text FROM frozen_versions WHERE phase = 1")

        assert frozen
        for (text,) in frozen:
            blocks = json.loads(text)["sheet"]["blocks"]
            fields = {f["field"]: f["value"] for b in blocks for f in b["fields"]}
            assert is_fictitious_reference(fields["cadastral_reference"])
            assert not {"owner", "holder", "titular"} & set(fields)


class TestLifecycleCoherence:
    def test_a_project_in_phase_n_was_promoted_n_times_with_a_frozen_version_per_phase(
        self, seeded
    ):
        for name, phase in rows(seeded, "SELECT name, current_phase FROM projects"):
            frozen = rows(
                seeded,
                "SELECT fv.phase, fv.version FROM frozen_versions fv "
                "JOIN projects p ON p.id = fv.project_id WHERE p.name = %s ORDER BY fv.phase",
                (name,),
            )
            promoted = rows(
                seeded,
                "SELECT pr.from_phase, pr.to_phase FROM promotions pr "
                "JOIN projects p ON p.id = pr.project_id WHERE p.name = %s ORDER BY 1",
                (name,),
            )

            assert frozen == [(n, 1) for n in range(phase)], name
            assert promoted == [(n, n + 1) for n in range(phase)], name

    def test_every_promotion_is_in_the_audit_log_as_the_seed(self, seeded):
        promoted = rows(seeded, "SELECT count(*) FROM promotions WHERE action = 'promote'")[0][0]
        audited = rows(
            seeded,
            "SELECT count(*) FROM audit_events WHERE entity = 'project' AND action = 'promote' "
            "AND user_id = 'seed' AND outcome = 'ok'",
        )[0][0]

        assert promoted > 0
        assert audited == promoted

    def test_phase_zero_projects_have_an_opportunity_and_a_scoring_but_no_plan(self, seeded):
        found = rows(
            seeded,
            "SELECT p.name, count(DISTINCT o.id), count(DISTINCT s.id), count(DISTINCT pl.id) "
            "FROM projects p JOIN opportunities o ON o.project_id = p.id "
            "LEFT JOIN opportunity_scorings s ON s.project_id = p.id "
            "LEFT JOIN project_plans pl ON pl.project_id = p.id "
            "WHERE p.current_phase = 0 GROUP BY p.name",
        )

        assert len(found) == 2
        assert all(row[1:] == (1, 1, 0) for row in found)

    def test_one_phase_zero_scoring_clears_the_threshold_and_the_other_does_not(self, seeded):
        found = rows(
            seeded,
            "SELECT s.recommendation FROM opportunity_scorings s "
            "JOIN projects p ON p.id = s.project_id WHERE p.current_phase = 0 "
            "ORDER BY s.recommendation",
        )

        assert found == [("do_not_pursue",), ("pursue",)]

    def test_started_projects_have_a_confirmed_plan(self, seeded):
        (without_plan,) = rows(
            seeded,
            "SELECT count(*) FROM projects p WHERE p.current_phase >= 1 AND NOT EXISTS "
            "(SELECT 1 FROM project_plans pl WHERE pl.project_id = p.id)",
        )[0]

        assert without_plan == 0

    def test_projects_past_phase_two_have_a_frozen_brief_and_technical_data(self, seeded):
        for (name,) in rows(seeded, "SELECT name FROM projects WHERE current_phase >= 3"):
            (content,) = rows(
                seeded,
                "SELECT fv.content FROM frozen_versions fv JOIN projects p ON p.id = fv.project_id "
                "WHERE p.name = %s AND fv.phase = 2",
                (name,),
            )[0]

            assert content["brief"]["client_approval"] != "pending", name
            assert len(content["technical_data"]["data"]) == 26, name

    def test_the_phase_two_project_keeps_a_draft_brief_waiting_for_the_client(self, seeded):
        (brief,) = rows(
            seeded,
            "SELECT e.content -> 'brief' FROM exit_deliverables e JOIN projects p "
            "ON p.id = e.project_id WHERE p.current_phase = 2 AND e.phase = 2",
        )[0:1][0]

        assert "client_approval" not in brief
        assert brief["needs"]

    def test_the_phase_two_project_has_unverified_data_and_the_later_ones_have_none(self, seeded):
        unverified = dict(
            rows(
                seeded,
                "SELECT p.current_phase, count(*) FILTER (WHERE NOT td.verified) "
                "FROM technical_data td JOIN projects p ON p.id = td.project_id GROUP BY 1",
            )
        )

        assert unverified[2] > 0
        assert all(count == 0 for phase, count in unverified.items() if phase >= 3)

    def test_the_technical_data_keep_value_source_original_and_edited(self, seeded):
        edited = rows(
            seeded,
            "SELECT value, original FROM technical_data WHERE field_id = 'builtArea' "
            "AND original IS NOT NULL AND value <> original",
        )

        assert edited, "one project shows an edited datum"
        assert {r[0] for r in rows(seeded, "SELECT DISTINCT source FROM technical_data")} >= {
            "catastro",
            "manual",
        }


class TestPausesAndTrafficLight:
    def test_one_open_pause_in_time_and_one_overdue(self, seeded):
        pauses = rows(
            seeded,
            "SELECT phase, reason, expected_resumption < current_date FROM pauses "
            "WHERE resumed_on IS NULL ORDER BY phase",
        )

        assert pauses == [(2, "client_wait", False), (4, "authority_wait", True)]

    def test_the_paused_projects_carry_the_flag(self, seeded):
        flagged = rows(seeded, "SELECT current_phase FROM projects WHERE paused ORDER BY 1")

        assert flagged == [(2,), (4,)]

    def test_active_projects_satisfy_the_activation_rule(self, seeded):
        rules = rows(
            seeded,
            "SELECT current_phase, active, responsible_id IS NOT NULL, traffic_light "
            "FROM projects ORDER BY current_phase, code",
        )

        for phase, active, has_owner, light in rules:
            assert has_owner
            assert active == (phase >= 1)
            assert (light is not None) == (phase >= 1)


class TestProjectTeam:
    def team(self, url):
        found: dict[str, set[str]] = {}
        for name, role in rows(
            url,
            "SELECT p.name, pm.role FROM project_members pm "
            "JOIN projects p ON p.id = pm.project_id",
        ):
            found.setdefault(name, set()).add(role)
        return {p.target_phase: found.get(p.name, set()) for p in PROJECTS}

    def test_projects_from_phase_two_have_a_team_and_earlier_ones_do_not(self, seeded):
        team = self.team(seeded)

        assert team[0] == team[1] == set()
        for phase in range(2, 7):
            assert {"project_director", "technical_lead", "architect"} <= team[phase], phase

    def test_the_signing_functions_follow_the_phase_that_needs_them(self, seeded):
        team = self.team(seeded)

        assert "licensed_signatory" in team[4] and "licensed_signatory" in team[5]
        assert "site_management" in team[6] and "site_collaborator" in team[6]
        assert all("sponsor" in team[phase] for phase in range(2, 7))

    def test_only_active_members_with_the_matching_qualification_are_assigned(self, seeded):
        wrong = rows(
            seeded,
            "SELECT 1 FROM project_members pm JOIN study_members sm ON sm.id = pm.member_id "
            "WHERE sm.status <> 'active' OR (pm.role = 'licensed_signatory' "
            "AND NOT 'licensed_signatory' = ANY (sm.qualifications)) "
            "OR (pm.role = 'site_management' AND NOT 'site_management' = ANY (sm.qualifications)) "
            "OR (pm.role = 'sponsor' AND NOT 'sponsor' = ANY (sm.qualifications))",
        )

        assert wrong == []


class TestApi:
    @pytest.fixture
    def client(self, seeded):
        settings = Settings(
            _env_file=None, database_url=seeded, dev_study_id=DEMO_STUDY_ID, dev_role="partner"
        )
        app = create_app(settings)
        app.dependency_overrides[get_settings] = lambda: settings
        return TestClient(app)

    def test_the_portfolio_lists_the_eight_projects(self, client):
        body = client.get("/api/portfolio").json()

        assert len(body["projects"]) == 8
        assert {p["phase"] for p in body["projects"]} == {0, 1, 2, 3, 4, 5, 6}

    def test_the_portfolio_shows_the_traffic_light_and_the_pauses(self, client):
        projects = client.get("/api/portfolio").json()["projects"]

        assert Counter(p["status"] for p in projects) == {
            "no_plan": 2,
            "paused": 2,
            "green": 2,
            "amber": 1,
            "red": 1,
        }
        paused = {p["phase"]: p["pause"] for p in projects if p["pause"]}
        assert paused[2]["overdue"] is False
        assert paused[4]["overdue"] is True and paused[4]["days_overdue"] > 0

    def test_a_project_opens_by_code_and_the_team_is_listed(self, client):
        projects = client.get("/api/portfolio").json()["projects"]
        advanced = next(p for p in projects if p["phase"] == 6)

        assert client.get(f"/api/projects/{advanced['code']}").status_code == 200
        team = client.get(f"/api/projects/{advanced['code']}/members").json()
        assert len(team["members"]) >= 5

    def test_the_dev_study_sees_none_of_it(self, seeded):
        settings = Settings(_env_file=None, database_url=seeded, dev_study_id=DEV_STUDY_ID)
        app = create_app(settings)
        app.dependency_overrides[get_settings] = lambda: settings

        assert TestClient(app).get("/api/portfolio").json()["projects"] == []


class TestCommandLineOnTheLocalDatabase:
    def test_creates_then_reports_that_it_already_existed(self, url, monkeypatch, capsys):
        from backend.app.shared.seed_demo import main

        monkeypatch.setenv("DATABASE_URL", url)
        monkeypatch.setenv("ENVIRONMENT", "development")
        monkeypatch.delenv("DEV_STUDY_ID", raising=False)

        first = main([])
        first_out = capsys.readouterr().out
        second = main([])
        second_out = capsys.readouterr().out

        assert (first, second) == (0, 0)
        assert "creado" in first_out
        assert "ya existía" in second_out
        assert sum(phases(url).values()) == 8
