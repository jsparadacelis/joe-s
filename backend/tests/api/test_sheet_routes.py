"""Sheet route of RGB-17a (simulated use case): contract shape and statuses.

Names fixed here for the Developer:
- backend.app.api.dependencies: project_sheet_unit_of_work (yields GetProjectSheet) and the
  type alias ProjectSheetUnitOfWork, overridable like start_project_unit_of_work.
- Route in backend/app/api/opportunity_routes.py: GET /api/projects/{code}/sheet ->
  GetProjectSheet.read(code); ProjectNotFound -> 404 project_not_found; SheetNotFound -> 404
  sheet_not_found; both as {"detail": {"code", "message"}} with the Spanish message.

RGB-19 extension of the contract (docs/plans/RGB-19/plan.md): the use case is called as
read(context, code) and the body gains `frozen_version` and `permissions` (the old keys stay).
"""

from contextlib import contextmanager
from dataclasses import replace
from datetime import datetime, timezone
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import get_settings, project_sheet_unit_of_work
from backend.app.api.main import create_app
from backend.app.opportunity.application.get_project_sheet import GetProjectSheet
from backend.app.opportunity.domain.errors import ProjectNotFound, SheetNotFound
from backend.app.opportunity.domain.plan import ProjectType, Scale
from backend.app.opportunity.domain.project_plan import ConfirmedPlan
from backend.app.opportunity.domain.project_sheet import (
    SheetPermissions,
    SheetProject,
    build_sheet,
)
from backend.app.shared.config import Settings

CODE = "PRY-2026-001"


def a_sheet():
    return build_sheet(
        project=SheetProject(
            id="project-1",
            code=CODE,
            current_phase=1,
            name="Warehouse (sample)",
            client="Client (sample)",
            location="Town (sample)",
            project_type=ProjectType.INDUSTRIAL,
            traffic_light="green",
        ),
        plan=ConfirmedPlan(
            project_code=CODE,
            project_type=ProjectType.INDUSTRIAL,
            scale=Scale.MEDIUM,
            weeks=(2, 2, 4, 5, 8, 40, 4),
            confirmed_by="sample-user",
            confirmed_at=datetime(2026, 10, 24, 10, 0, tzinfo=timezone.utc),
        ),
        manual={"sponsor": "Sponsor (sample)", "team": "Team (sample)"},
    )


@pytest.fixture
def reader():
    service = create_autospec(GetProjectSheet, spec_set=True, instance=True)
    service.read.return_value = a_sheet()
    return service


@pytest.fixture
def contexts():
    return []


@pytest.fixture
def client(reader, contexts):
    app = create_app(Settings(_env_file=None))
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None)

    @contextmanager
    def fake_unit(context):
        contexts.append(context)
        yield reader

    app.dependency_overrides[project_sheet_unit_of_work] = lambda: fake_unit
    return TestClient(app)


class TestPermissionsAndVersion:
    def test_the_defaults_of_a_live_sheet(self, client):
        body = client.get(f"/api/projects/{CODE}/sheet").json()

        assert body["frozen_version"] is None
        assert body["permissions"] == {"can_edit": False, "can_promote": False}

    def test_what_the_use_case_decides_reaches_the_body(self, client, reader):
        reader.read.return_value = replace(
            a_sheet(), permissions=SheetPermissions(True, True), frozen_version=None
        )

        body = client.get(f"/api/projects/{CODE}/sheet").json()

        assert body["permissions"] == {"can_edit": True, "can_promote": True}

    def test_a_frozen_sheet_reports_its_version(self, client, reader):
        reader.read.return_value = replace(a_sheet(), phase=2, frozen_version=1)

        body = client.get(f"/api/projects/{CODE}/sheet").json()

        assert (body["phase"], body["frozen_version"]) == (2, 1)
        assert body["permissions"] == {"can_edit": False, "can_promote": False}

    def test_the_context_is_the_first_argument(self, client, reader, contexts):
        client.get(f"/api/projects/{CODE}/sheet")

        assert reader.read.call_args.args[0] is contexts[0]


class TestGetSheet:
    def test_returns_the_contract(self, client, reader):
        response = client.get(f"/api/projects/{CODE}/sheet")

        assert response.status_code == 200
        body = response.json()
        assert set(body) == {
            "code",
            "phase",
            "completion",
            "blocks",
            "frozen_version",
            "permissions",
        }
        assert body["code"] == CODE
        assert body["phase"] == 1
        assert body["completion"] == {"filled": 8, "required": 20, "percent": 40}
        assert [b["block"] for b in body["blocks"]] == [
            "identification",
            "engagement",
            "governance",
            "client_contact",
            "timing",
            "risk",
            "information",
            "status",
        ]
        reader.read.assert_called_once()
        assert reader.read.call_args.args[1] == CODE

    def test_blocks_and_fields_have_the_literal_shape(self, client):
        body = client.get(f"/api/projects/{CODE}/sheet").json()

        identification = body["blocks"][0]
        assert set(identification) == {"block", "filled", "required", "complete", "fields"}
        assert (identification["filled"], identification["required"]) == (6, 7)
        assert identification["complete"] is False
        assert identification["fields"][2] == {
            "field": "client",
            "required": True,
            "value": "Client (sample)",
            "source": "scoring",
        }
        assert identification["fields"][4] == {
            "field": "cadastral_reference",
            "required": True,
            "value": None,
            "source": "manual",
        }
        assert identification["fields"][0] == {
            "field": "code",
            "required": True,
            "value": CODE,
            "source": "auto",
        }

    def test_optional_fields_and_the_plan_value(self, client):
        body = client.get(f"/api/projects/{CODE}/sheet").json()
        blocks = {b["block"]: b for b in body["blocks"]}

        team = next(f for f in blocks["governance"]["fields"] if f["field"] == "team")
        assert team == {
            "field": "team",
            "required": False,
            "value": "Team (sample)",
            "source": "manual",
        }
        plan = next(f for f in blocks["timing"]["fields"] if f["field"] == "confirmed_plan")
        assert plan["value"] == {
            "weeks_by_phase": {"1": 2, "2": 2, "3": 4, "4": 5, "5": 8, "6": 40, "7": 4},
            "total": 65,
        }
        assert plan["source"] == "scoring"

    def test_the_request_context_reaches_the_unit_of_work(self, client, contexts):
        client.get(f"/api/projects/{CODE}/sheet")

        assert len(contexts) == 1
        assert contexts[0].study_id

    def test_unknown_project_is_404(self, client, reader):
        reader.read.side_effect = ProjectNotFound(CODE)

        response = client.get(f"/api/projects/{CODE}/sheet")

        assert response.status_code == 404
        detail = response.json()["detail"]
        assert set(detail) == {"code", "message"}
        assert detail["code"] == "project_not_found"
        assert CODE in detail["message"]

    def test_an_opportunity_has_no_sheet_404(self, client, reader):
        reader.read.side_effect = SheetNotFound()

        response = client.get(f"/api/projects/{CODE}/sheet")

        assert response.status_code == 404
        detail = response.json()["detail"]
        assert set(detail) == {"code", "message"}
        assert detail["code"] == "sheet_not_found"
        assert detail["message"] == SheetNotFound().message
        assert "ficha" in detail["message"].lower()

    def test_the_route_is_get_only(self, client):
        assert client.post(f"/api/projects/{CODE}/sheet", json={}).status_code == 405
