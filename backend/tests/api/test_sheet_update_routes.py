"""PUT /api/projects/{code}/sheet of RGB-17b (simulated use case): contract and statuses.

Names fixed here for the Developer:
- backend.app.api.dependencies: update_project_sheet_unit_of_work (yields UpdateProjectSheet),
  overridable like project_sheet_unit_of_work.
- PUT /api/projects/{code}/sheet with body {"fields": {...}?, "plan": {...}?} calls
  UpdateProjectSheet.execute(context, code, fields, plan) (None when omitted) and answers 200
  with the same JSON as GET /sheet. A returned error maps to: NoAuthority 403 (+ `allowed`),
  SheetNotEditable 409, anything else 422 (+ `field` when the error has one). Unknown project
  raised -> 404 project_not_found. Detail is always {"code", "message", ...}. A body that is
  not an object -> 422 invalid_request (global handler).
"""

import json
from contextlib import contextmanager
from dataclasses import asdict
from datetime import datetime, timezone
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import get_settings, update_project_sheet_unit_of_work
from backend.app.api.main import create_app
from backend.app.audit.domain.ports import AuditLog
from backend.app.lifecycle.domain.errors import NoAuthority
from backend.app.opportunity.application.update_project_sheet import (
    UpdateProjectSheet,
    UpdateSheetResult,
)
from backend.app.opportunity.domain.errors import (
    InvalidProjectType,
    InvalidScale,
    InvalidSheetField,
    InvalidSheetRequest,
    InvalidWeeks,
    ProjectNotFound,
    SheetNotEditable,
    UnknownSheetField,
)
from backend.app.opportunity.domain.plan import ProjectType, Scale
from backend.app.opportunity.domain.ports import ProjectPlans, ProjectSheets
from backend.app.opportunity.domain.project_plan import ConfirmedPlan
from backend.app.opportunity.domain.project_sheet import SheetProject, build_sheet
from backend.app.shared.config import Settings

CODE = "PRY-2026-001"
URL = f"/api/projects/{CODE}/sheet"
PLAN = {"project_type": "rehabilitation", "scale": "large", "weeks": [3, 4, 6, 8, 9, 40, 5]}


def a_sheet_project():
    return SheetProject(
        id="project-1",
        code=CODE,
        current_phase=1,
        name="Warehouse (sample)",
        client="Client (sample)",
        location="Town (sample)",
        project_type=ProjectType.INDUSTRIAL,
        traffic_light=None,
    )


def a_sheet():
    return build_sheet(
        project=a_sheet_project(),
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


@pytest.fixture
def writer():
    service = create_autospec(UpdateProjectSheet, spec_set=True, instance=True)
    service.execute.return_value = UpdateSheetResult(a_sheet(), None)
    return service


@pytest.fixture
def contexts():
    return []


@pytest.fixture
def client(writer, contexts):
    app = create_app(Settings(_env_file=None))
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None)

    @contextmanager
    def fake_unit(context):
        contexts.append(context)
        yield writer

    app.dependency_overrides[update_project_sheet_unit_of_work] = lambda: fake_unit
    return TestClient(app)


def rejected(error):
    return UpdateSheetResult(None, error)


class TestOk:
    def test_answers_200_with_the_shape_of_get_sheet(self, client):
        response = client.put(URL, json={"fields": {"sponsor": "Sponsor (sample)"}})

        assert response.status_code == 200
        assert response.json() == json.loads(json.dumps(asdict(a_sheet())))
        assert set(response.json()) == {"code", "phase", "completion", "blocks"}

    def test_passes_fields_and_plan_to_the_use_case(self, client, writer, contexts):
        client.put(URL, json={"fields": {"team": ""}, "plan": PLAN})

        writer.execute.assert_called_once_with(contexts[0], CODE, {"team": ""}, PLAN)
        assert contexts[0].study_id

    def test_omitted_parts_are_none(self, client, writer, contexts):
        client.put(URL, json={"fields": {"team": "x"}})
        client.put(URL, json={"plan": PLAN})

        assert [c.args[2:] for c in writer.execute.call_args_list] == [
            ({"team": "x"}, None),
            (None, PLAN),
        ]

    def test_the_value_types_reach_the_domain_untouched(self, client, writer, contexts):
        client.put(URL, json={"fields": {"team": 5}, "plan": {"weeks": "x"}})

        writer.execute.assert_called_once_with(contexts[0], CODE, {"team": 5}, {"weeks": "x"})


class TestErrors:
    def test_unknown_project_is_404(self, client, writer):
        writer.execute.side_effect = ProjectNotFound(CODE)

        response = client.put(URL, json={"fields": {"team": "x"}})

        assert response.status_code == 404
        detail = response.json()["detail"]
        assert set(detail) == {"code", "message"}
        assert detail["code"] == "project_not_found"
        assert CODE in detail["message"]

    def test_no_authority_is_403_with_who_can(self, client, writer):
        error = NoAuthority(1, ["Socio", "Director"])
        writer.execute.return_value = rejected(error)

        response = client.put(URL, json={"fields": {"team": "x"}})

        assert response.status_code == 403
        assert response.json()["detail"] == {
            "code": "no_authority",
            "message": error.message,
            "allowed": ["Socio", "Director"],
        }

    def test_not_in_phase_1_is_409(self, client, writer):
        writer.execute.return_value = rejected(SheetNotEditable())

        response = client.put(URL, json={"fields": {"team": "x"}})

        assert response.status_code == 409
        assert response.json()["detail"] == {
            "code": "sheet_not_editable",
            "message": SheetNotEditable().message,
        }

    @pytest.mark.parametrize(
        "error, code, field",
        [
            (
                InvalidSheetField("contract_signed_on", "formato"),
                "invalid_field",
                "contract_signed_on",
            ),
            (UnknownSheetField("code"), "unknown_field", "code"),
        ],
    )
    def test_field_errors_are_422_with_the_field(self, client, writer, error, code, field):
        writer.execute.return_value = rejected(error)

        response = client.put(URL, json={"fields": {field: "x"}})

        assert response.status_code == 422
        assert response.json()["detail"] == {"code": code, "message": error.message, "field": field}

    @pytest.mark.parametrize(
        "error, code",
        [
            (InvalidWeeks(), "invalid_weeks"),
            (InvalidScale(), "invalid_scale"),
            (InvalidProjectType(), "invalid_project_type"),
            (InvalidSheetRequest(), "invalid_request"),
        ],
    )
    def test_other_validation_errors_are_422(self, client, writer, error, code):
        writer.execute.return_value = rejected(error)

        response = client.put(URL, json={"plan": PLAN})

        assert response.status_code == 422
        assert response.json()["detail"] == {"code": code, "message": error.message}

    @pytest.mark.parametrize("body", ["text", [1], 3, None])
    def test_a_body_that_is_not_an_object_is_422_invalid_request(self, client, writer, body):
        response = client.put(URL, json=body)

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_request"
        writer.execute.assert_not_called()

    def test_no_body_is_422_invalid_request(self, client, writer):
        response = client.put(URL)

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_request"
        writer.execute.assert_not_called()


def test_unstorable_characters_answer_422_invalid_field_with_the_real_use_case():
    """The real use case over simulated ports: a NUL JSON escape must be rejected, not saved."""
    sheets = create_autospec(ProjectSheets, spec_set=True, instance=True)
    sheets.get_project.return_value = a_sheet_project()
    plans = create_autospec(ProjectPlans, spec_set=True, instance=True)
    audit_log = create_autospec(AuditLog, spec_set=True, instance=True)
    app = create_app(Settings(_env_file=None))
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None)

    @contextmanager
    def unit(context):
        yield UpdateProjectSheet(sheets, plans, audit_log)

    app.dependency_overrides[update_project_sheet_unit_of_work] = lambda: unit

    response = TestClient(app).put(URL, json={"fields": {"sponsor": "a\u0000b"}})

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert (detail["code"], detail["field"]) == ("invalid_field", "sponsor")
    assert "contiene caracteres no permitidos" in detail["message"]
    sheets.save_content.assert_not_called()
    audit_log.record.assert_called_once()
