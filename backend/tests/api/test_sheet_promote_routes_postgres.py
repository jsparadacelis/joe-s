"""RGB-19 against real Postgres: GET/PUT permissions, POST /sheet/promote, freezing, RLS,
atomicity and audit."""

from unittest.mock import create_autospec

import psycopg
import pytest
from fastapi.testclient import TestClient

from backend.app.access.infrastructure.dev_project_roles import DevProjectRoles
from backend.app.api.dependencies import get_settings
from backend.app.api.main import create_app
from backend.app.audit.infrastructure.postgres_audit_log import PostgresAuditLog
from backend.app.lifecycle.application.promotion_service import PromotionService
from backend.app.lifecycle.domain.ports import DeliverableValidator
from backend.app.lifecycle.infrastructure.postgres_lifecycle import PostgresLifecycle
from backend.app.opportunity.application.promote_project_sheet import PromoteProjectSheet
from backend.app.opportunity.domain.errors import PromotionRejected
from backend.app.opportunity.infrastructure.postgres_project_plans import PostgresProjectPlans
from backend.app.opportunity.infrastructure.postgres_project_sheets import PostgresProjectSheets
from backend.app.shared.config import Settings
from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
CODE = "PRY-2026-001"
SHEET = f"/api/projects/{CODE}/sheet"
PROMOTE = f"{SHEET}/promote"
WEEKS = [2, 2, 4, 5, 8, 40, 4]
MANUAL = {
    name: f"{name} (sample)"
    for name in (
        "cadastral_reference",
        "scope_included",
        "scope_excluded",
        "contract_signed_on",
        "sponsor",
        "project_director",
        "technical_lead",
        "contact",
        "next_milestone",
        "next_milestone_on",
        "main_risk",
        "risk_owner",
        "repository_path",
    )
}


def seed(url, phase, content):
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO studies (id, name) VALUES (%s, 'A (sample)'), (%s, 'B (sample)')",
            (STUDY_A, STUDY_B),
        )
        admin.execute(
            "INSERT INTO projects (study_id, code, name, current_phase) VALUES "
            "(%s, %s, 'Warehouse (sample)', %s)",
            (STUDY_A, CODE, phase),
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
    if content is not None:
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute(
                "INSERT INTO exit_deliverables (study_id, project_id, phase, content) "
                "SELECT study_id, id, 1, %s FROM projects",
                (psycopg.types.json.Jsonb(content),),
            )


@pytest.fixture
def base_url(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    return url


@pytest.fixture
def url(base_url):
    seed(base_url, 1, dict(MANUAL))
    return base_url


@pytest.fixture
def incomplete_url(base_url):
    seed(base_url, 1, {**MANUAL, "sponsor": "  ", "main_risk": ""})
    return base_url


@pytest.fixture
def client_for(request):
    def make(url, study_id=STUDY_A, role="partner"):
        settings = Settings(_env_file=None, database_url=url, dev_study_id=study_id, dev_role=role)
        app = create_app(settings)
        app.dependency_overrides[get_settings] = lambda: settings
        return TestClient(app)

    return make


def rows(url, sql, params=()):
    with psycopg.connect(url, autocommit=True) as admin:
        return admin.execute(sql, params).fetchall()


def audit_rows(url):
    return rows(
        url,
        "SELECT entity, action, outcome, old_value, new_value, version FROM audit_events "
        "ORDER BY created_at, id",
    )


def values(body):
    return {f["field"]: f["value"] for b in body["blocks"] for f in b["fields"]}


class TestPermissions:
    def test_phase_1_partner_with_a_complete_sheet_can_edit_and_promote(self, url, client_for):
        body = client_for(url).get(SHEET).json()

        assert body["completion"]["percent"] == 100
        assert body["frozen_version"] is None
        assert body["permissions"] == {"can_edit": True, "can_promote": True}

    def test_phase_1_director_too(self, url, client_for):
        body = client_for(url, role="director").get(SHEET).json()

        assert body["permissions"] == {"can_edit": True, "can_promote": True}

    def test_an_incomplete_sheet_cannot_be_promoted(self, incomplete_url, client_for):
        body = client_for(incomplete_url).get(SHEET).json()

        assert body["completion"]["percent"] < 100
        assert body["permissions"] == {"can_edit": True, "can_promote": False}

    @pytest.mark.parametrize("role", ["project_director", "architect", "site_collaborator"])
    def test_without_authority_nothing_is_allowed(self, url, client_for, role):
        body = client_for(url, role=role).get(SHEET).json()

        assert body["permissions"] == {"can_edit": False, "can_promote": False}

    def test_put_returns_the_permissions_and_the_completing_edit_enables_promotion(
        self, incomplete_url, client_for
    ):
        client = client_for(incomplete_url)

        body = client.put(
            SHEET, json={"fields": {"sponsor": "Sponsor (sample)", "main_risk": "Risk (sample)"}}
        ).json()

        assert body["completion"]["percent"] == 100
        assert body["permissions"] == {"can_edit": True, "can_promote": True}
        assert body["frozen_version"] is None
        assert client.get(SHEET).json() == body

    def test_put_incomplete_keeps_promotion_disabled(self, incomplete_url, client_for):
        body = client_for(incomplete_url).put(SHEET, json={"fields": {"team": "x"}}).json()

        assert body["permissions"] == {"can_edit": True, "can_promote": False}


class TestPromote:
    def test_200_with_the_contract(self, url, client_for):
        response = client_for(url).post(PROMOTE)

        assert response.status_code == 200
        body = response.json()
        assert body["code"] == CODE
        assert body["action"] == "promote"
        assert (body["previous_phase"], body["current_phase"], body["frozen_version"]) == (1, 2, 1)
        assert body["sheet"]["phase"] == 2
        assert body["sheet"]["frozen_version"] == 1
        assert body["sheet"]["permissions"] == {"can_edit": False, "can_promote": False}
        assert body["sheet"]["completion"]["percent"] == 100

    def test_the_project_moves_to_phase_2_and_its_deliverable_opens(self, url, client_for):
        client_for(url).post(PROMOTE)

        assert rows(url, "SELECT current_phase FROM projects") == [(2,)]
        assert rows(
            url, "SELECT phase, complete, approved FROM exit_deliverables ORDER BY phase"
        ) == [(1, True, True), (2, False, False)]

    def test_version_1_of_phase_1_is_frozen_with_the_sheet_inside(self, url, client_for):
        body = client_for(url).post(PROMOTE).json()

        ((phase, version, content, frozen_by),) = rows(
            url, "SELECT phase, version, content, frozen_by FROM frozen_versions"
        )
        assert (phase, version) == (1, 1)
        assert frozen_by
        assert content["sponsor"] == "sponsor (sample)"
        sheet = content["sheet"]
        assert set(sheet) == {"code", "phase", "completion", "blocks"}
        assert sheet["phase"] == 1
        assert sheet["completion"] == {"filled": 20, "required": 20, "percent": 100}
        found = values(sheet)
        assert found["client"] == "Client (sample)"
        assert found["confirmed_plan"]["total"] == 65
        assert found["sponsor"] == "sponsor (sample)"
        assert values(body["sheet"]) == found

    def test_the_frozen_version_is_immutable(self, url, client_for):
        client_for(url).post(PROMOTE)

        for sql in ("UPDATE frozen_versions SET content = '{}'", "DELETE FROM frozen_versions"):
            with pytest.raises(psycopg.Error):
                with study_transaction(
                    url, RequestContext(STUDY_A, "demo-user", Role.PARTNER)
                ) as conn:
                    conn.execute(sql)
        assert rows(url, "SELECT count(*) FROM frozen_versions") == [(1,)]

    def test_get_afterwards_returns_the_frozen_version_not_a_rebuild(self, url, client_for):
        client = client_for(url)
        promoted = client.post(PROMOTE).json()["sheet"]
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute("UPDATE projects SET name = 'Renamed afterwards'")
            admin.execute("UPDATE exit_deliverables SET content = '{}' WHERE phase = 1")

        body = client.get(SHEET).json()

        assert body == promoted
        assert body["frozen_version"] == 1
        assert body["phase"] == 2
        assert body["permissions"] == {"can_edit": False, "can_promote": False}
        assert values(body)["name"] == "Warehouse (sample)"

    @pytest.mark.parametrize("role", ["partner", "director", "architect"])
    def test_the_frozen_sheet_has_no_permissions_for_anyone(self, url, client_for, role):
        client_for(url).post(PROMOTE)

        body = client_for(url, role=role).get(SHEET).json()

        assert body["permissions"] == {"can_edit": False, "can_promote": False}
        assert body["frozen_version"] == 1

    def test_put_after_promoting_is_409_sheet_not_editable(self, url, client_for):
        client = client_for(url)
        client.post(PROMOTE)

        response = client.put(SHEET, json={"fields": {"sponsor": "Late"}})

        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "sheet_not_editable"

    def test_promoting_twice_is_409(self, url, client_for):
        client = client_for(url)
        client.post(PROMOTE)

        response = client.post(PROMOTE)

        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "sheet_not_editable"
        assert rows(url, "SELECT count(*) FROM frozen_versions") == [(1,)]

    def test_audit_has_the_promotion_and_the_freeze(self, url, client_for):
        client_for(url).post(PROMOTE)

        events = audit_rows(url)
        assert ("project", "promote", "ok", {"phase": 1}, {"phase": 2}, 1) in events
        assert ("project_sheet", "freeze", "ok", {"phase": 1}, {"frozen_version": 1}, 1) in events
        assert len(events) == 2

    def test_the_promotion_is_recorded(self, url, client_for):
        client_for(url).post(PROMOTE)

        assert rows(url, "SELECT action, from_phase, to_phase, outcome FROM promotions") == [
            ("promote", 1, 2, "ok")
        ]


class TestRejections:
    def test_incomplete_is_422_with_the_missing_labels_and_nothing_changes(
        self, incomplete_url, client_for
    ):
        url = incomplete_url

        response = client_for(url).post(PROMOTE)

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert detail["code"] == "incomplete_deliverable"
        assert detail["missing"] == ["Promotor", "Riesgo principal"]
        assert rows(url, "SELECT current_phase FROM projects") == [(1,)]
        assert rows(url, "SELECT count(*) FROM frozen_versions") == [(0,)]
        assert rows(
            url, "SELECT phase, complete, approved, content ? 'sheet' FROM exit_deliverables"
        ) == [(1, False, False, False)]
        assert audit_rows(url) == [
            (
                "project_sheet",
                "promote",
                "rejected",
                {"phase": 1},
                {"error": "incomplete_deliverable"},
                None,
            )
        ]

    @pytest.mark.parametrize("role", ["project_director", "architect", "site_collaborator"])
    def test_without_authority_is_403_and_audited(self, url, client_for, role):
        response = client_for(url, role=role).post(PROMOTE)

        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "no_authority"
        assert rows(url, "SELECT current_phase FROM projects") == [(1,)]
        assert rows(url, "SELECT count(*) FROM frozen_versions") == [(0,)]
        assert [(e[0], e[1], e[2], e[4]) for e in audit_rows(url)] == [
            ("project_sheet", "promote", "rejected", {"error": "no_authority"})
        ]

    def test_unknown_project_is_404(self, url, client_for):
        response = client_for(url).post("/api/projects/PRY-2026-999/sheet/promote")

        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "project_not_found"

    def test_another_study_gets_404_and_changes_nothing(self, url, client_for):
        response = client_for(url, study_id=STUDY_B).post(PROMOTE)

        assert response.status_code == 404
        assert rows(url, "SELECT current_phase FROM projects") == [(1,)]
        assert rows(url, "SELECT count(*) FROM frozen_versions") == [(0,)]

    def test_another_study_cannot_read_the_frozen_sheet(self, url, client_for):
        client_for(url).post(PROMOTE)

        assert client_for(url, study_id=STUDY_B).get(SHEET).status_code == 404

    def test_a_phase_0_opportunity_is_409(self, base_url, client_for):
        seed(base_url, 0, None)

        response = client_for(base_url).post(PROMOTE)

        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "sheet_not_editable"


class TestAtomicity:
    def test_a_rejection_of_the_promotion_service_leaves_no_finalized_content(self, url):
        validator = create_autospec(DeliverableValidator, spec_set=True, instance=True)
        validator.validate.return_value = ["blocked by a phase 1 validator"]
        context = RequestContext(STUDY_A, "demo-user", Role.PARTNER)

        with pytest.raises(PromotionRejected) as raised:
            with study_transaction(url, context) as conn:
                audit_log = PostgresAuditLog(conn)
                use_case = PromoteProjectSheet(
                    PostgresProjectSheets(conn),
                    PostgresProjectPlans(conn),
                    PromotionService(
                        PostgresLifecycle(conn), audit_log, {1: validator}, DevProjectRoles(context)
                    ),
                    audit_log,
                )
                use_case.execute(context, CODE)

        assert raised.value.code == "incomplete_deliverable"
        assert rows(url, "SELECT current_phase FROM projects") == [(1,)]
        assert rows(url, "SELECT count(*) FROM frozen_versions") == [(0,)]
        assert rows(url, "SELECT count(*) FROM promotions") == [(0,)]
        assert rows(
            url, "SELECT phase, complete, approved, content ? 'sheet' FROM exit_deliverables"
        ) == [(1, False, False, False)]
        assert audit_rows(url) == []

    def test_a_failure_in_the_audit_rolls_everything_back(self, url):
        context = RequestContext(STUDY_A, "demo-user", Role.PARTNER)

        class Broken(PostgresAuditLog):
            def record(self, event):
                if event.action == "freeze":
                    raise RuntimeError("audit failure")
                super().record(event)

        with pytest.raises(RuntimeError):
            with study_transaction(url, context) as conn:
                audit_log = Broken(conn)
                PromoteProjectSheet(
                    PostgresProjectSheets(conn),
                    PostgresProjectPlans(conn),
                    PromotionService(
                        PostgresLifecycle(conn), audit_log, {}, DevProjectRoles(context)
                    ),
                    audit_log,
                ).execute(context, CODE)

        assert rows(url, "SELECT current_phase FROM projects") == [(1,)]
        assert rows(url, "SELECT count(*) FROM frozen_versions") == [(0,)]
        assert rows(url, "SELECT count(*) FROM exit_deliverables WHERE phase = 2") == [(0,)]
        assert rows(url, "SELECT complete, approved, content ? 'sheet' FROM exit_deliverables") == [
            (False, False, False)
        ]


class TestConcurrency:
    def test_parallel_promotions_one_wins_and_the_rest_are_audited_409(self, url, client_for):
        import threading

        attempts = 8
        barrier = threading.Barrier(attempts)
        statuses: list[int] = []

        def attempt():
            client = client_for(url)
            barrier.wait()
            statuses.append(client.post(PROMOTE).status_code)

        threads = [threading.Thread(target=attempt) for _ in range(attempts)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        assert sorted(statuses) == [200] + [409] * (attempts - 1)
        assert rows(url, "SELECT current_phase FROM projects") == [(2,)]
        assert rows(url, "SELECT phase, version FROM frozen_versions") == [(1, 1)]
        assert rows(url, "SELECT count(*) FROM promotions") == [(1,)]
        rejected = [e for e in audit_rows(url) if e[2] == "rejected"]
        assert len(rejected) == attempts - 1
        assert [(e[0], e[1], e[3], e[4]) for e in rejected] == [
            ("project_sheet", "promote", {"phase": 2}, {"error": "sheet_not_editable"})
        ] * (attempts - 1)
