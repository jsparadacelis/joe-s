"""POST /api/projects/{code}/sheet/promote of RGB-19 (simulated use case).

Names fixed here for the Developer:
- backend.app.api.dependencies: promote_project_sheet_unit_of_work (yields PromoteProjectSheet)
  and the alias PromoteProjectSheetUnitOfWork, overridable like the other units of work.
- POST /api/projects/{code}/sheet/promote (no body) calls
  PromoteProjectSheet.execute(context, code). Success: 200
  {"code", "action": "promote", "previous_phase", "current_phase", "frozen_version", "sheet"}
  with `sheet` in the shape of GET /sheet. A returned error maps to: NoAuthority 403 (+ `allowed`),
  SheetNotEditable 409, IncompleteDeliverable 422 (+ `missing`), and a raised
  opportunity ProjectNotFound 404 project_not_found. PromotionRejected maps like the error it
  wraps. Detail is always {"code", "message", ...} with the Spanish message.
"""

import json
from contextlib import contextmanager
from dataclasses import asdict, replace
from datetime import datetime, timezone
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import get_settings, promote_project_sheet_unit_of_work
from backend.app.api.main import create_app
from backend.app.lifecycle.application.promotion_service import Transition
from backend.app.lifecycle.domain.errors import IncompleteDeliverable, NoAuthority, NoNextPhase
from backend.app.opportunity.application.promote_project_sheet import (
    PromoteProjectSheet,
    PromoteSheetResult,
)
from backend.app.opportunity.domain.errors import (
    ProjectNotFound,
    PromotionRejected,
    SheetNotEditable,
)
from backend.app.opportunity.domain.plan import ProjectType, Scale
from backend.app.opportunity.domain.project_plan import ConfirmedPlan
from backend.app.opportunity.domain.project_sheet import (
    SheetPermissions,
    SheetProject,
    build_sheet,
)
from backend.app.shared.config import Settings

CODE = "PRY-2026-001"
URL = f"/api/projects/{CODE}/sheet/promote"


def a_sheet():
    sheet = build_sheet(
        project=SheetProject(
            id="project-1",
            code=CODE,
            current_phase=1,
            name="Warehouse (sample)",
            client="Client (sample)",
            location="Town (sample)",
            project_type=ProjectType.INDUSTRIAL,
            traffic_light=None,
        ),
        plan=ConfirmedPlan(
            project_code=CODE,
            project_type=ProjectType.INDUSTRIAL,
            scale=Scale.MEDIUM,
            weeks=(2, 2, 4, 5, 8, 40, 4),
            confirmed_by="sample-user",
            confirmed_at=datetime(2026, 10, 24, 10, 0, tzinfo=timezone.utc),
        ),
        manual={"sponsor": "Sponsor (sample)"},
    )
    return replace(sheet, phase=2, frozen_version=1, permissions=SheetPermissions(False, False))


def success():
    return PromoteSheetResult(a_sheet(), Transition(True, "promote", 1, 2, 1, None), None)


def rejected(error):
    return PromoteSheetResult(None, None, error)


@pytest.fixture
def promoter():
    service = create_autospec(PromoteProjectSheet, spec_set=True, instance=True)
    service.execute.return_value = success()
    return service


@pytest.fixture
def contexts():
    return []


@pytest.fixture
def client(promoter, contexts):
    app = create_app(Settings(_env_file=None))
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None)

    @contextmanager
    def fake_unit(context):
        contexts.append(context)
        yield promoter

    app.dependency_overrides[promote_project_sheet_unit_of_work] = lambda: fake_unit
    return TestClient(app)


class TestOk:
    def test_answers_200_with_the_contract(self, client):
        response = client.post(URL)

        assert response.status_code == 200
        body = response.json()
        assert set(body) == {
            "code",
            "action",
            "previous_phase",
            "current_phase",
            "frozen_version",
            "sheet",
        }
        assert body["code"] == CODE
        assert body["action"] == "promote"
        assert (body["previous_phase"], body["current_phase"], body["frozen_version"]) == (1, 2, 1)

    def test_the_sheet_has_the_shape_of_get_sheet(self, client):
        body = client.post(URL).json()

        assert body["sheet"] == json.loads(json.dumps(asdict(a_sheet())))
        assert set(body["sheet"]) == {
            "code",
            "phase",
            "completion",
            "blocks",
            "frozen_version",
            "permissions",
        }
        assert body["sheet"]["frozen_version"] == 1
        assert body["sheet"]["permissions"] == {"can_edit": False, "can_promote": False}

    def test_the_context_reaches_the_use_case_and_there_is_no_body(
        self, client, promoter, contexts
    ):
        client.post(URL)

        promoter.execute.assert_called_once_with(contexts[0], CODE)
        assert contexts[0].study_id

    def test_the_route_is_post_only(self, client):
        assert client.get(URL).status_code == 405
        assert client.put(URL, json={}).status_code == 405


class TestErrors:
    def test_unknown_project_is_404(self, client, promoter):
        promoter.execute.side_effect = ProjectNotFound(CODE)

        response = client.post(URL)

        assert response.status_code == 404
        detail = response.json()["detail"]
        assert set(detail) == {"code", "message"}
        assert detail["code"] == "project_not_found"
        assert CODE in detail["message"]

    def test_no_authority_is_403_with_who_can(self, client, promoter):
        promoter.execute.return_value = rejected(NoAuthority(1, ["socio", "director"]))

        response = client.post(URL)

        assert response.status_code == 403
        detail = response.json()["detail"]
        assert detail["code"] == "no_authority"
        assert detail["allowed"] == ["socio", "director"]
        assert detail["message"]

    def test_outside_phase_1_is_409_sheet_not_editable(self, client, promoter):
        promoter.execute.return_value = rejected(SheetNotEditable())

        response = client.post(URL)

        assert response.status_code == 409
        assert response.json()["detail"] == {
            "code": "sheet_not_editable",
            "message": SheetNotEditable().message,
        }

    def test_incomplete_is_422_with_the_missing_labels(self, client, promoter):
        promoter.execute.return_value = rejected(
            IncompleteDeliverable(["Promotor", "Riesgo principal"])
        )

        response = client.post(URL)

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert detail["code"] == "incomplete_deliverable"
        assert detail["missing"] == ["Promotor", "Riesgo principal"]
        assert "Promotor" in detail["message"]

    @pytest.mark.parametrize(
        ("error", "status"),
        [
            (NoAuthority(1, ["socio"]), 403),
            (IncompleteDeliverable(["x"]), 422),
        ],
    )
    def test_a_rejection_of_the_promotion_service_maps_like_the_error_it_wraps(
        self, client, promoter, error, status
    ):
        promoter.execute.side_effect = PromotionRejected(error)

        response = client.post(URL)

        assert response.status_code == status
        assert response.json()["detail"]["code"] == error.code

    def test_any_other_wrapped_rejection_is_422(self, client, promoter):
        promoter.execute.side_effect = PromotionRejected(NoNextPhase())

        response = client.post(URL)

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "no_next_phase"
