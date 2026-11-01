"""RGB-32 against real Postgres: GET/PUT/POST of the brief, the single frozen version that
holds the brief and the technical data photo, RLS, atomicity, audit and the race."""

import threading
from unittest.mock import create_autospec

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.types.json import Jsonb

from backend.app.access.infrastructure.dev_project_roles import DevProjectRoles
from backend.app.api.dependencies import get_settings
from backend.app.api.main import create_app
from backend.app.audit.infrastructure.postgres_audit_log import PostgresAuditLog
from backend.app.briefing.application.promote_brief import PromoteBrief
from backend.app.briefing.domain.errors import PromotionRejected
from backend.app.briefing.infrastructure.postgres_briefs import PostgresBriefs
from backend.app.lifecycle.application.promotion_service import PromotionService
from backend.app.lifecycle.domain.ports import DeliverableValidator
from backend.app.lifecycle.infrastructure.postgres_lifecycle import PostgresLifecycle
from backend.app.shared.config import Settings
from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role
from backend.app.technical_data.infrastructure.postgres_technical_data import PostgresTechnicalData

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
CODE = "PRY-2026-001"
URL = f"/api/projects/{CODE}/brief"
PROMOTE = f"{URL}/promote"
REFERENCE = "0000000AA0000A0000AA"
BRIEF = {
    "needs": "Needs (sample)",
    "program": "Program (sample)",
    "constraints": "Constraints (sample)",
    "target_budget": 250000,
    "deadline": "2027-06-30",
    "topographic_survey": "Survey (sample)",
    "alignment": "Alignment (sample)",
    "client_approval": "email",
}
FIELDS = list(BRIEF)


def seed(url, phase=2, brief=None, data=True):
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO studies (id, name) VALUES (%s, 'A (sample)'), (%s, 'B (sample)')",
            (STUDY_A, STUDY_B),
        )
        admin.execute(
            "INSERT INTO projects (study_id, code, name, current_phase) VALUES "
            "(%s, %s, 'House (sample)', %s)",
            (STUDY_A, CODE, phase),
        )
        if brief is not None:
            admin.execute(
                "INSERT INTO exit_deliverables (study_id, project_id, phase, content) "
                "SELECT study_id, id, 2, %s FROM projects",
                (Jsonb({"brief": brief}),),
            )
        if data:
            admin.execute(
                "INSERT INTO technical_data (study_id, project_id, field_id, value, source, "
                "original, verified) SELECT study_id, id, 'address', 'Street 1 (edited)', "
                "'catastro', 'Street 1', true FROM projects"
            )
            admin.execute(
                "INSERT INTO technical_data (study_id, project_id, field_id, value, source, "
                "original, verified) SELECT study_id, id, 'year', '1990', 'manual', NULL, false "
                "FROM projects"
            )
            admin.execute(
                "INSERT INTO technical_data_queries (study_id, project_id, cadastral_reference) "
                "SELECT study_id, id, %s FROM projects",
                (REFERENCE,),
            )


@pytest.fixture
def base_url(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    return url


@pytest.fixture
def url(base_url):
    seed(base_url, brief=dict(BRIEF))
    return base_url


@pytest.fixture
def empty_url(base_url):
    seed(base_url, brief=None, data=False)
    return base_url


@pytest.fixture
def client_for():
    def make(url, study_id=STUDY_A, role="project_director"):
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


class TestGet:
    def test_the_live_brief_with_the_starting_data(self, url, client_for):
        response = client_for(url).get(URL)

        assert response.status_code == 200
        body = response.json()
        assert body["fields"] == BRIEF
        assert (body["phase"], body["frozen_version"]) == (2, None)
        assert body["completeness"] == {
            "missing": [],
            "technical_data_obtained": True,
            "technical_data_queried": True,
            "client_approval_recorded": True,
            "complete": True,
        }
        photo = body["technical_data"]
        assert photo["cadastral_reference"] == REFERENCE
        assert photo["unverified"] == ["year"]
        assert {d["id"]: d for d in photo["data"]}["address"] == {
            "id": "address",
            "value": "Street 1 (edited)",
            "source": "catastro",
            "original": "Street 1",
            "edited": True,
            "verified": True,
        }

    def test_an_empty_brief_is_all_empty_and_pending(self, empty_url, client_for):
        body = client_for(empty_url).get(URL).json()

        assert body["fields"]["needs"] is None
        assert body["fields"]["client_approval"] == "pending"
        assert body["completeness"]["missing"] == [
            "Necesidades",
            "Programa",
            "Condicionantes",
            "Presupuesto objetivo",
            "Plazo",
        ]
        assert body["completeness"]["technical_data_obtained"] is False
        assert body["permissions"] == {"can_edit": True, "can_promote": False}

    def test_the_project_director_can_edit_and_promote(self, url, client_for):
        assert client_for(url).get(URL).json()["permissions"] == {
            "can_edit": True,
            "can_promote": True,
        }

    @pytest.mark.parametrize(
        "role", ["partner", "director", "architect", "technical_lead", "site_collaborator"]
    )
    def test_the_rest_can_read_but_nothing_else(self, url, client_for, role):
        response = client_for(url, role=role).get(URL)

        assert response.status_code == 200
        assert response.json()["fields"] == BRIEF
        assert response.json()["permissions"] == {"can_edit": False, "can_promote": False}

    @pytest.mark.parametrize("phase", [0, 1])
    def test_before_phase_2_there_is_no_brief(self, base_url, client_for, phase):
        seed(base_url, phase=phase)

        response = client_for(base_url).get(URL)

        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "brief_not_found"

    def test_unknown_project(self, url, client_for):
        response = client_for(url).get("/api/projects/PRY-2026-999/brief")

        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "project_not_found"

    def test_another_study_gets_404(self, url, client_for):
        assert client_for(url, study_id=STUDY_B).get(URL).status_code == 404

    def test_reading_writes_nothing(self, url, client_for):
        client_for(url).get(URL)

        assert audit_rows(url) == []
        assert rows(url, "SELECT content FROM exit_deliverables") == [({"brief": BRIEF},)]


class TestPut:
    def test_saves_and_returns_the_brief_with_permissions(self, empty_url, client_for):
        client = client_for(empty_url)

        response = client.put(
            URL, json={"fields": {"needs": "  Needs (sample) ", "target_budget": 1200.5}}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["fields"]["needs"] == "Needs (sample)"
        assert body["fields"]["target_budget"] == 1200.5
        assert body["permissions"] == {"can_edit": True, "can_promote": False}
        assert client.get(URL).json() == body
        assert rows(empty_url, "SELECT content, complete, approved FROM exit_deliverables") == [
            ({"brief": {"needs": "Needs (sample)", "target_budget": 1200.5}}, False, False)
        ]

    def test_edits_merge_and_null_deletes(self, url, client_for):
        client = client_for(url)

        body = client.put(
            URL, json={"fields": {"alignment": None, "program": "New program (sample)"}}
        ).json()

        assert body["fields"]["alignment"] is None
        assert body["fields"]["program"] == "New program (sample)"
        assert body["fields"]["needs"] == "Needs (sample)"

    def test_the_completing_edit_enables_promotion(self, base_url, client_for):
        seed(base_url, brief={k: v for k, v in BRIEF.items() if k != "client_approval"})
        client = client_for(base_url)
        assert client.get(URL).json()["permissions"]["can_promote"] is False

        body = client.put(URL, json={"fields": {"client_approval": "signed"}}).json()

        assert body["permissions"] == {"can_edit": True, "can_promote": True}

    def test_the_edit_is_audited(self, url, client_for):
        client_for(url).put(URL, json={"fields": {"needs": "Changed (sample)"}})

        assert audit_rows(url) == [
            (
                "project_brief",
                "update",
                "ok",
                {"needs": "Needs (sample)"},
                {"needs": "Changed (sample)"},
                None,
            )
        ]

    def test_it_never_changes_the_phase(self, url, client_for):
        client_for(url).put(URL, json={"fields": {"client_approval": "signed"}})

        assert rows(url, "SELECT current_phase FROM projects") == [(2,)]
        assert rows(url, "SELECT count(*) FROM frozen_versions") == [(0,)]

    @pytest.mark.parametrize("role", ["partner", "director", "architect", "technical_lead"])
    def test_without_authority_is_403_audited_and_saves_nothing(self, url, client_for, role):
        response = client_for(url, role=role).put(URL, json={"fields": {"needs": "Intruder"}})

        assert response.status_code == 403
        detail = response.json()["detail"]
        assert detail["code"] == "no_authority"
        assert detail["allowed"] == ["Director de proyecto"]
        assert rows(url, "SELECT content FROM exit_deliverables") == [({"brief": BRIEF},)]
        assert [(e[0], e[1], e[2], e[4]) for e in audit_rows(url)] == [
            ("project_brief", "update", "rejected", {"error": "no_authority"})
        ]

    @pytest.mark.parametrize("phase", [1, 3, 5])
    def test_outside_phase_2_is_409_audited(self, base_url, client_for, phase):
        seed(base_url, phase=phase)

        response = client_for(base_url).put(URL, json={"fields": {"needs": "Late"}})

        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "brief_not_editable"
        assert [(e[1], e[2], e[3], e[4]) for e in audit_rows(base_url)] == [
            ("update", "rejected", {"phase": phase}, {"error": "brief_not_editable"})
        ]
        assert rows(base_url, "SELECT count(*) FROM exit_deliverables") == [(0,)]

    @pytest.mark.parametrize(
        ("fields", "code", "field"),
        [
            ({"bogus": "x"}, "unknown_field", "bogus"),
            ({"deadline": "30/06/2027"}, "invalid_field", "deadline"),
            ({"target_budget": "100"}, "invalid_field", "target_budget"),
            ({"target_budget": -1}, "invalid_field", "target_budget"),
            ({"target_budget": 1e12}, "invalid_field", "target_budget"),
            ({"needs": "x" * 2001}, "invalid_field", "needs"),
            ({"needs": "a\u0000b"}, "invalid_field", "needs"),
            ({"needs": 5}, "invalid_field", "needs"),
            ({"client_approval": "verbal"}, "invalid_field", "client_approval"),
        ],
    )
    def test_invalid_input_is_422_audited_and_saves_nothing(
        self, url, client_for, fields, code, field
    ):
        response = client_for(url).put(URL, json={"fields": fields})

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert (detail["code"], detail["field"]) == (code, field)
        assert rows(url, "SELECT content FROM exit_deliverables") == [({"brief": BRIEF},)]
        assert [(e[2], e[4]) for e in audit_rows(url)] == [("rejected", {"error": code})]

    @pytest.mark.parametrize("body", [{}, {"fields": {}}, {"fields": []}, {"fields": "x"}])
    def test_an_empty_or_malformed_change_is_422_invalid_request(self, url, client_for, body):
        response = client_for(url).put(URL, json=body)

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_request"

    def test_the_stored_text_survives_non_ascii_characters(self, url, client_for):
        client = client_for(url)

        client.put(URL, json={"fields": {"needs": "Ñandú — ü 家"}})

        assert client.get(URL).json()["fields"]["needs"] == "Ñandú — ü 家"

    def test_unknown_project_is_404(self, url, client_for):
        response = client_for(url).put(
            "/api/projects/PRY-2026-999/brief", json={"fields": {"a": 1}}
        )

        assert response.status_code == 404

    def test_another_study_gets_404_and_changes_nothing(self, url, client_for):
        response = client_for(url, study_id=STUDY_B).put(URL, json={"fields": {"needs": "x"}})

        assert response.status_code == 404
        assert rows(url, "SELECT content FROM exit_deliverables") == [({"brief": BRIEF},)]


class TestPromote:
    def test_200_with_the_contract(self, url, client_for):
        response = client_for(url).post(PROMOTE)

        assert response.status_code == 200
        body = response.json()
        assert body["code"] == CODE
        assert body["action"] == "promote"
        assert (body["previous_phase"], body["current_phase"], body["frozen_version"]) == (2, 3, 1)
        assert body["brief"]["phase"] == 3
        assert body["brief"]["frozen_version"] == 1
        assert body["brief"]["fields"] == BRIEF
        assert body["brief"]["permissions"] == {"can_edit": False, "can_promote": False}

    def test_the_project_moves_to_phase_3_and_its_deliverable_opens(self, url, client_for):
        client_for(url).post(PROMOTE)

        assert rows(url, "SELECT current_phase FROM projects") == [(3,)]
        assert rows(
            url, "SELECT phase, complete, approved FROM exit_deliverables ORDER BY phase"
        ) == [(2, True, True), (3, False, False)]

    def test_one_frozen_version_holds_the_brief_and_the_technical_data_photo(self, url, client_for):
        body = client_for(url).post(PROMOTE).json()

        ((phase, version, content, frozen_by),) = rows(
            url, "SELECT phase, version, content, frozen_by FROM frozen_versions"
        )
        assert (phase, version) == (2, 1)
        assert frozen_by
        assert set(content) == {"brief", "technical_data"}
        assert content["brief"] == BRIEF
        photo = content["technical_data"]
        assert photo["cadastral_reference"] == REFERENCE
        assert photo["queried_at"].endswith("Z")
        assert len(photo["data"]) == 26
        by_id = {d["id"]: d for d in photo["data"]}
        assert by_id["address"] == {
            "id": "address",
            "value": "Street 1 (edited)",
            "source": "catastro",
            "original": "Street 1",
            "edited": True,
            "verified": True,
        }
        assert by_id["year"]["verified"] is False
        assert by_id["year"]["source"] == "manual"
        assert by_id["year"]["original"] is None
        assert photo["unverified"] == ["year"]
        assert body["brief"]["technical_data"] == photo

    def test_unverified_data_do_not_block(self, url, client_for):
        assert rows(url, "SELECT count(*) FROM technical_data WHERE NOT verified") == [(1,)]

        assert client_for(url).post(PROMOTE).status_code == 200

    def test_the_frozen_version_is_immutable(self, url, client_for):
        client_for(url).post(PROMOTE)

        for sql in ("UPDATE frozen_versions SET content = '{}'", "DELETE FROM frozen_versions"):
            with pytest.raises(psycopg.Error):
                with study_transaction(
                    url, RequestContext(STUDY_A, "demo-user", Role.PROJECT_DIRECTOR)
                ) as conn:
                    conn.execute(sql)
        assert rows(url, "SELECT count(*) FROM frozen_versions") == [(1,)]

    def test_get_afterwards_returns_the_frozen_version_not_a_rebuild(self, url, client_for):
        client = client_for(url)
        promoted = client.post(PROMOTE).json()["brief"]
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute("UPDATE technical_data SET value = 'Changed afterwards'")
            admin.execute("UPDATE exit_deliverables SET content = '{}' WHERE phase = 2")

        body = client.get(URL).json()

        assert body == promoted
        assert body["frozen_version"] == 1
        assert body["phase"] == 3
        assert {d["id"]: d for d in body["technical_data"]["data"]}["address"][
            "value"
        ] == "Street 1 (edited)"

    @pytest.mark.parametrize("role", ["project_director", "partner", "architect"])
    def test_the_frozen_brief_has_no_permissions_for_anyone(self, url, client_for, role):
        client_for(url).post(PROMOTE)

        body = client_for(url, role=role).get(URL).json()

        assert body["permissions"] == {"can_edit": False, "can_promote": False}

    def test_put_after_promoting_is_409(self, url, client_for):
        client = client_for(url)
        client.post(PROMOTE)

        response = client.put(URL, json={"fields": {"needs": "Late"}})

        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "brief_not_editable"

    def test_promoting_twice_is_409(self, url, client_for):
        client = client_for(url)
        client.post(PROMOTE)

        response = client.post(PROMOTE)

        assert response.status_code == 409
        assert rows(url, "SELECT count(*) FROM frozen_versions") == [(1,)]

    def test_audit_has_the_promotion_and_the_freeze(self, url, client_for):
        client_for(url).post(PROMOTE)

        events = audit_rows(url)
        assert ("project", "promote", "ok", {"phase": 2}, {"phase": 3}, 1) in events
        assert ("project_brief", "freeze", "ok", {"phase": 2}, {"frozen_version": 1}, 1) in events
        assert len(events) == 2

    def test_the_promotion_is_recorded(self, url, client_for):
        client_for(url).post(PROMOTE)

        assert rows(url, "SELECT action, from_phase, to_phase, outcome FROM promotions") == [
            ("promote", 2, 3, "ok")
        ]

    def test_a_manual_only_technical_datum_counts_as_obtained(self, base_url, client_for):
        seed(base_url, brief=dict(BRIEF), data=False)
        with psycopg.connect(base_url, autocommit=True) as admin:
            admin.execute(
                "INSERT INTO technical_data (study_id, project_id, field_id, value, source) "
                "SELECT study_id, id, 'address', 'Typed by hand (sample)', 'manual' FROM projects"
            )

        response = client_for(base_url).post(PROMOTE)

        assert response.status_code == 200
        assert response.json()["brief"]["technical_data"]["cadastral_reference"] is None


class TestRejections:
    def test_incomplete_is_422_with_every_blocker_and_nothing_changes(self, empty_url, client_for):
        url = empty_url

        response = client_for(url).post(PROMOTE)

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert detail["code"] == "incomplete_deliverable"
        assert detail["missing"] == [
            "Necesidades",
            "Programa",
            "Condicionantes",
            "Presupuesto objetivo",
            "Plazo",
            "Datos técnicos obtenidos",
            "Aprobación del cliente registrada",
        ]
        assert rows(url, "SELECT current_phase FROM projects") == [(2,)]
        assert rows(url, "SELECT count(*) FROM frozen_versions") == [(0,)]
        assert rows(url, "SELECT count(*) FROM promotions") == [(0,)]
        assert audit_rows(url) == [
            (
                "project_brief",
                "promote",
                "rejected",
                {"phase": 2},
                {"error": "incomplete_deliverable"},
                None,
            )
        ]

    def test_a_pending_approval_blocks(self, base_url, client_for):
        seed(base_url, brief={**BRIEF, "client_approval": "pending"})

        response = client_for(base_url).post(PROMOTE)

        assert response.status_code == 422
        assert response.json()["detail"]["missing"] == ["Aprobación del cliente registrada"]

    def test_a_missing_required_field_blocks(self, base_url, client_for):
        seed(base_url, brief={k: v for k, v in BRIEF.items() if k != "deadline"})

        response = client_for(base_url).post(PROMOTE)

        assert response.status_code == 422
        assert response.json()["detail"]["missing"] == ["Plazo"]

    def test_no_technical_data_blocks_even_with_a_query_on_record(self, base_url, client_for):
        seed(base_url, brief=dict(BRIEF), data=False)
        with psycopg.connect(base_url, autocommit=True) as admin:
            admin.execute(
                "INSERT INTO technical_data_queries (study_id, project_id, cadastral_reference) "
                "SELECT study_id, id, %s FROM projects",
                (REFERENCE,),
            )

        response = client_for(base_url).post(PROMOTE)

        assert response.status_code == 422
        assert response.json()["detail"]["missing"] == ["Datos técnicos obtenidos"]

    @pytest.mark.parametrize(
        "role", ["partner", "director", "architect", "technical_lead", "site_collaborator"]
    )
    def test_only_the_project_director_promotes_403_audited(self, url, client_for, role):
        response = client_for(url, role=role).post(PROMOTE)

        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "no_authority"
        assert response.json()["detail"]["allowed"] == ["Director de proyecto"]
        assert rows(url, "SELECT current_phase FROM projects") == [(2,)]
        assert rows(url, "SELECT count(*) FROM frozen_versions") == [(0,)]
        assert [(e[0], e[1], e[2], e[4]) for e in audit_rows(url)] == [
            ("project_brief", "promote", "rejected", {"error": "no_authority"})
        ]

    def test_unknown_project_is_404(self, url, client_for):
        response = client_for(url).post("/api/projects/PRY-2026-999/brief/promote")

        assert response.status_code == 404

    def test_another_study_gets_404_and_changes_nothing(self, url, client_for):
        response = client_for(url, study_id=STUDY_B).post(PROMOTE)

        assert response.status_code == 404
        assert rows(url, "SELECT current_phase FROM projects") == [(2,)]
        assert rows(url, "SELECT count(*) FROM frozen_versions") == [(0,)]

    def test_another_study_cannot_read_the_frozen_brief(self, url, client_for):
        client_for(url).post(PROMOTE)

        assert client_for(url, study_id=STUDY_B).get(URL).status_code == 404

    @pytest.mark.parametrize("phase", [0, 1, 3])
    def test_outside_phase_2_is_409(self, base_url, client_for, phase):
        seed(base_url, phase=phase)

        response = client_for(base_url).post(PROMOTE)

        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "brief_not_editable"

    def test_the_generic_promotion_route_cannot_skip_the_brief(self, empty_url, client_for):
        with psycopg.connect(empty_url, autocommit=True) as admin:
            admin.execute(
                "INSERT INTO exit_deliverables (study_id, project_id, phase, complete, approved) "
                "SELECT study_id, id, 2, true, true FROM projects"
            )

        response = client_for(empty_url).post(f"/api/projects/{CODE}/promote")

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "incomplete_deliverable"
        assert rows(empty_url, "SELECT current_phase FROM projects") == [(2,)]


class TestAtomicity:
    def test_a_rejection_of_the_promotion_service_leaves_no_finalized_content(self, url):
        validator = create_autospec(DeliverableValidator, spec_set=True, instance=True)
        validator.validate.return_value = ["blocked by a phase 2 validator"]
        context = RequestContext(STUDY_A, "demo-user", Role.PROJECT_DIRECTOR)

        with pytest.raises(PromotionRejected) as raised:
            with study_transaction(url, context) as conn:
                audit_log = PostgresAuditLog(conn)
                roles = DevProjectRoles(context)
                PromoteBrief(
                    PostgresBriefs(conn),
                    PostgresTechnicalData(conn),
                    roles,
                    PromotionService(PostgresLifecycle(conn), audit_log, {2: validator}, roles),
                    audit_log,
                ).execute(context, CODE)

        assert raised.value.code == "incomplete_deliverable"
        assert rows(url, "SELECT current_phase FROM projects") == [(2,)]
        assert rows(url, "SELECT count(*) FROM frozen_versions") == [(0,)]
        assert rows(url, "SELECT count(*) FROM promotions") == [(0,)]
        assert rows(url, "SELECT content, complete, approved FROM exit_deliverables") == [
            ({"brief": BRIEF}, False, False)
        ]
        assert audit_rows(url) == []

    def test_a_failure_in_the_audit_rolls_everything_back(self, url):
        context = RequestContext(STUDY_A, "demo-user", Role.PROJECT_DIRECTOR)

        class Broken(PostgresAuditLog):
            def record(self, event):
                if event.action == "freeze":
                    raise RuntimeError("audit failure")
                super().record(event)

        with pytest.raises(RuntimeError):
            with study_transaction(url, context) as conn:
                audit_log = Broken(conn)
                roles = DevProjectRoles(context)
                PromoteBrief(
                    PostgresBriefs(conn),
                    PostgresTechnicalData(conn),
                    roles,
                    PromotionService(PostgresLifecycle(conn), audit_log, {}, roles),
                    audit_log,
                ).execute(context, CODE)

        assert rows(url, "SELECT current_phase FROM projects") == [(2,)]
        assert rows(url, "SELECT count(*) FROM frozen_versions") == [(0,)]
        assert rows(url, "SELECT count(*) FROM exit_deliverables WHERE phase = 3") == [(0,)]
        assert rows(url, "SELECT content, complete, approved FROM exit_deliverables") == [
            ({"brief": BRIEF}, False, False)
        ]


class TestConcurrency:
    def test_parallel_promotions_one_wins_and_the_rest_are_audited_409(self, url, client_for):
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
        assert rows(url, "SELECT current_phase FROM projects") == [(3,)]
        assert rows(url, "SELECT phase, version FROM frozen_versions") == [(2, 1)]
        assert rows(url, "SELECT count(*) FROM promotions") == [(1,)]
        rejected = [e for e in audit_rows(url) if e[2] == "rejected"]
        assert [(e[0], e[1], e[3], e[4]) for e in rejected] == [
            ("project_brief", "promote", {"phase": 3}, {"error": "brief_not_editable"})
        ] * (attempts - 1)

    def test_an_edit_racing_a_promotion_is_either_frozen_or_refused(self, url, client_for):
        barrier = threading.Barrier(2)
        results = {}

        def promote():
            barrier.wait()
            results["promote"] = client_for(url).post(PROMOTE).status_code

        def edit():
            barrier.wait()
            results["edit"] = (
                client_for(url).put(URL, json={"fields": {"needs": "Racing (sample)"}}).status_code
            )

        threads = [threading.Thread(target=promote), threading.Thread(target=edit)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        assert results["promote"] == 200
        assert results["edit"] in (200, 409)
        ((content,),) = rows(url, "SELECT content FROM frozen_versions")
        assert content["brief"]["needs"] == (
            "Racing (sample)" if results["edit"] == 200 else "Needs (sample)"
        )
