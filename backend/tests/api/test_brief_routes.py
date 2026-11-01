"""Brief routes of RGB-32 with simulated use cases.

Names fixed here:
- backend.app.api.dependencies: brief_unit_of_work (yields GetBrief), update_brief_unit_of_work
  (UpdateBrief) and promote_brief_unit_of_work (PromoteBrief), overridable like the others.
- GET /api/projects/{code}/brief -> GetBrief.read(context, code); PUT .../brief with
  {"fields": {...}} -> UpdateBrief.execute(context, code, fields); POST .../brief/promote (no
  body) -> PromoteBrief.execute(context, code).
- Shape of a brief: {code, phase, frozen_version, fields, completeness: {missing,
  technical_data_obtained, technical_data_queried, client_approval_recorded, complete},
  technical_data, permissions: {can_edit, can_promote}}.
- Promote 200: {code, action, previous_phase, current_phase, frozen_version, brief}.
- Errors {"detail": {code, message, ...}}: ProjectNotFound 404, BriefNotFound 404, NoAuthority
  403 (+allowed), BriefNotEditable 409, IncompleteDeliverable 422 (+missing), brief field errors
  422 (+field), InvalidBriefRequest 422. PromotionRejected maps like the error it wraps.
"""

from contextlib import contextmanager
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import (
    brief_unit_of_work,
    get_settings,
    promote_brief_unit_of_work,
    update_brief_unit_of_work,
)
from backend.app.api.main import create_app
from backend.app.briefing.application.get_brief import GetBrief
from backend.app.briefing.application.promote_brief import PromoteBrief, PromoteBriefResult
from backend.app.briefing.application.technical_snapshot import snapshot
from backend.app.briefing.application.update_brief import UpdateBrief, UpdateBriefResult
from backend.app.briefing.application.view import frozen_view, live_view
from backend.app.briefing.domain.errors import (
    BriefNotEditable,
    BriefNotFound,
    IncompleteBrief,
    InvalidBriefField,
    InvalidBriefRequest,
    ProjectNotFound,
    PromotionRejected,
    UnknownBriefField,
)
from backend.app.lifecycle.application.promotion_service import Transition
from backend.app.lifecycle.domain.errors import NoAuthority, NoNextPhase
from backend.app.shared.config import Settings
from backend.tests.briefing.application.support import BRIEF, a_project, a_query, some_data

CODE = "PRY-2026-001"
URL = f"/api/projects/{CODE}/brief"
PROMOTE = f"{URL}/promote"


def a_brief(phase=2):
    return live_view(a_project(phase), BRIEF, some_data(), a_query(), authorized=True)


def a_frozen():
    return frozen_view(
        a_project(3), {"brief": BRIEF, "technical_data": snapshot(some_data(), a_query())}
    )


@pytest.fixture
def reader():
    use_case = create_autospec(GetBrief, spec_set=True, instance=True)
    use_case.read.return_value = a_brief()
    return use_case


@pytest.fixture
def writer():
    use_case = create_autospec(UpdateBrief, spec_set=True, instance=True)
    use_case.execute.return_value = UpdateBriefResult(a_brief(), None)
    return use_case


@pytest.fixture
def promoter():
    use_case = create_autospec(PromoteBrief, spec_set=True, instance=True)
    use_case.execute.return_value = PromoteBriefResult(
        a_frozen(), Transition(True, "promote", 2, 3, 1, None), None
    )
    return use_case


@pytest.fixture
def contexts():
    return []


@pytest.fixture
def client(reader, writer, promoter, contexts):
    app = create_app(Settings(_env_file=None))
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None)

    def unit(use_case):
        @contextmanager
        def fake_unit(context):
            contexts.append(context)
            yield use_case

        return lambda: fake_unit

    app.dependency_overrides[brief_unit_of_work] = unit(reader)
    app.dependency_overrides[update_brief_unit_of_work] = unit(writer)
    app.dependency_overrides[promote_brief_unit_of_work] = unit(promoter)
    return TestClient(app)


class TestGet:
    def test_answers_200_with_the_contract(self, client):
        response = client.get(URL)

        assert response.status_code == 200
        body = response.json()
        assert set(body) == {
            "code",
            "phase",
            "frozen_version",
            "fields",
            "completeness",
            "technical_data",
            "permissions",
        }
        assert (body["code"], body["phase"], body["frozen_version"]) == (CODE, 2, None)
        assert body["fields"] == {
            "needs": "Needs (sample)",
            "program": "Program (sample)",
            "constraints": "Constraints (sample)",
            "target_budget": 250000,
            "deadline": "2027-06-30",
            "topographic_survey": None,
            "alignment": None,
            "client_approval": "email",
        }
        assert body["completeness"] == {
            "missing": [],
            "technical_data_obtained": True,
            "technical_data_queried": True,
            "client_approval_recorded": True,
            "complete": True,
        }
        assert body["permissions"] == {"can_edit": True, "can_promote": True}
        assert body["technical_data"] == snapshot(some_data(), a_query())

    def test_the_context_reaches_the_use_case(self, client, reader, contexts):
        client.get(URL)

        reader.read.assert_called_once_with(contexts[0], CODE)

    def test_a_frozen_brief_says_its_version(self, client, reader):
        reader.read.return_value = a_frozen()

        body = client.get(URL).json()

        assert (body["phase"], body["frozen_version"]) == (3, 1)
        assert body["permissions"] == {"can_edit": False, "can_promote": False}

    def test_unknown_project_is_404(self, client, reader):
        reader.read.side_effect = ProjectNotFound(CODE)

        response = client.get(URL)

        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "project_not_found"

    def test_before_phase_2_is_404_brief_not_found(self, client, reader):
        reader.read.side_effect = BriefNotFound()

        response = client.get(URL)

        assert response.status_code == 404
        assert response.json()["detail"] == {
            "code": "brief_not_found",
            "message": BriefNotFound().message,
        }


class TestPut:
    def test_answers_200_with_the_brief(self, client, writer, contexts):
        response = client.put(URL, json={"fields": {"needs": "x"}})

        assert response.status_code == 200
        assert response.json()["permissions"] == {"can_edit": True, "can_promote": True}
        writer.execute.assert_called_once_with(contexts[0], CODE, {"needs": "x"})

    def test_a_missing_fields_key_reaches_the_domain_as_none(self, client, writer):
        client.put(URL, json={})

        assert writer.execute.call_args.args[2] is None

    def test_unknown_project_is_404(self, client, writer):
        writer.execute.side_effect = ProjectNotFound(CODE)

        assert client.put(URL, json={"fields": {"needs": "x"}}).status_code == 404

    @pytest.mark.parametrize(
        ("error", "status", "code"),
        [
            (NoAuthority(2, ["Director de proyecto"]), 403, "no_authority"),
            (BriefNotEditable(), 409, "brief_not_editable"),
            (UnknownBriefField("bogus"), 422, "unknown_field"),
            (InvalidBriefField("deadline", "debe ser una fecha"), 422, "invalid_field"),
            (InvalidBriefRequest(), 422, "invalid_request"),
        ],
    )
    def test_business_errors(self, client, writer, error, status, code):
        writer.execute.return_value = UpdateBriefResult(None, error)

        response = client.put(URL, json={"fields": {"needs": "x"}})

        assert response.status_code == status
        detail = response.json()["detail"]
        assert detail["code"] == code
        assert detail["message"] == error.message

    def test_a_field_error_names_the_field(self, client, writer):
        writer.execute.return_value = UpdateBriefResult(None, InvalidBriefField("deadline", "x"))

        assert client.put(URL, json={"fields": {}}).json()["detail"]["field"] == "deadline"

    def test_no_authority_lists_who_can(self, client, writer):
        writer.execute.return_value = UpdateBriefResult(
            None, NoAuthority(2, ["Director de proyecto"])
        )

        detail = client.put(URL, json={"fields": {"needs": "x"}}).json()["detail"]

        assert detail["allowed"] == ["Director de proyecto"]

    @pytest.mark.parametrize("body", ["[1]", '"x"', "null", "not json"])
    def test_a_body_that_is_not_an_object_is_422_invalid_request(self, client, body):
        response = client.put(URL, content=body, headers={"content-type": "application/json"})

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_request"


class TestPromote:
    def test_answers_200_with_the_contract(self, client, promoter, contexts):
        response = client.post(PROMOTE)

        assert response.status_code == 200
        body = response.json()
        assert set(body) == {
            "code",
            "action",
            "previous_phase",
            "current_phase",
            "frozen_version",
            "brief",
        }
        assert body["action"] == "promote"
        assert (body["previous_phase"], body["current_phase"], body["frozen_version"]) == (2, 3, 1)
        assert body["brief"]["frozen_version"] == 1
        assert body["brief"]["permissions"] == {"can_edit": False, "can_promote": False}
        promoter.execute.assert_called_once_with(contexts[0], CODE)

    def test_the_route_is_post_only(self, client):
        assert client.get(PROMOTE).status_code in (404, 405)
        assert client.put(PROMOTE, json={}).status_code == 405

    def test_unknown_project_is_404(self, client, promoter):
        promoter.execute.side_effect = ProjectNotFound(CODE)

        assert client.post(PROMOTE).status_code == 404

    @pytest.mark.parametrize(
        ("error", "status"),
        [
            (NoAuthority(2, ["Director de proyecto"]), 403),
            (BriefNotEditable(), 409),
            (IncompleteBrief(["Plazo"]), 422),
        ],
    )
    def test_returned_rejections(self, client, promoter, error, status):
        promoter.execute.return_value = PromoteBriefResult(None, None, error)

        response = client.post(PROMOTE)

        assert response.status_code == status
        assert response.json()["detail"]["code"] == error.code

    def test_incomplete_lists_the_blockers(self, client, promoter):
        promoter.execute.return_value = PromoteBriefResult(
            None, None, IncompleteBrief(["Plazo", "Aprobación del cliente registrada"])
        )

        detail = client.post(PROMOTE).json()["detail"]

        assert detail["missing"] == ["Plazo", "Aprobación del cliente registrada"]
        assert detail["message"] == "El brief no está listo para promover: faltan 2 requisitos."

    def test_a_rejection_of_the_promotion_service_maps_like_its_error(self, client, promoter):
        promoter.execute.side_effect = PromotionRejected(NoAuthority(2, ["Director de proyecto"]))

        response = client.post(PROMOTE)

        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "no_authority"

    def test_any_other_promotion_service_rejection_is_422(self, client, promoter):
        promoter.execute.side_effect = PromotionRejected(NoNextPhase())

        assert client.post(PROMOTE).status_code == 422
