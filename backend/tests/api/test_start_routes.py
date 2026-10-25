"""Start and plan routes of RGB-16 (simulated use cases): contract shapes and statuses.

Names fixed here for the Developer:
- backend.app.api.dependencies: start_project_unit_of_work (yields StartProject) and
  project_plan_unit_of_work (yields ProjectPlanReader); type aliases StartProjectUnitOfWork and
  ProjectPlanUnitOfWork.
- Routes in backend/app/api/opportunity_routes.py (or a new router included in main):
  POST /api/projects/{code}/start with body {scale, weeks}; GET /api/projects/{code}/plan.
- The route does not validate scale/weeks values: it hands them raw to
  StartProject.execute(context, code, scale, weeks); a missing field or a non-object body is
  `invalid_request`.
"""

from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import (
    get_settings,
    project_plan_unit_of_work,
    start_project_unit_of_work,
)
from backend.app.api.main import create_app
from backend.app.lifecycle.application.promotion_service import Transition
from backend.app.lifecycle.domain.errors import IncompleteDeliverable, NoAuthority
from backend.app.opportunity.application.start_project import (
    ProjectPlanReader,
    StartProject,
    StartResult,
)
from backend.app.opportunity.domain.errors import (
    InvalidScale,
    InvalidWeeks,
    PlanAlreadyConfirmed,
    PlanNotFound,
    ProjectNotFound,
    ProjectNotInOpportunityPhase,
)
from backend.app.opportunity.domain.plan import ProjectType, Scale
from backend.app.opportunity.domain.project_plan import ConfirmedPlan, ProposedPlan
from backend.app.shared.config import Settings

CODE = "PRY-2026-001"
WEEKS = [2, 2, 4, 5, 8, 40, 4]
BODY = {"scale": "medium", "weeks": WEEKS}
WHEN = datetime(2026, 10, 24, 10, 0, 5, tzinfo=timezone.utc)


@pytest.fixture
def start_service():
    service = create_autospec(StartProject, spec_set=True, instance=True)
    service.execute.return_value = StartResult(
        transition=Transition(True, "promote", 0, 1, 1, None),
        plan=ProposedPlan(ProjectType.INDUSTRIAL, Scale.MEDIUM, tuple(WEEKS)),
    )
    return service


@pytest.fixture
def reader():
    service = create_autospec(ProjectPlanReader, spec_set=True, instance=True)
    service.read.return_value = ConfirmedPlan(
        project_code=CODE,
        project_type=ProjectType.INDUSTRIAL,
        scale=Scale.MEDIUM,
        weeks=tuple(WEEKS),
        confirmed_by="sample-user",
        confirmed_at=WHEN,
    )
    return service


@pytest.fixture
def contexts():
    return []


@pytest.fixture
def client(start_service, reader, contexts):
    app = create_app(Settings(_env_file=None))
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None)

    @contextmanager
    def fake_start(context):
        contexts.append(context)
        yield start_service

    @contextmanager
    def fake_reader(context):
        yield reader

    app.dependency_overrides[start_project_unit_of_work] = lambda: fake_start
    app.dependency_overrides[project_plan_unit_of_work] = lambda: fake_reader
    return TestClient(app)


def rejected(error, phase=0):
    return StartResult(transition=Transition(False, "start", phase, phase, None, error), plan=None)


class TestStart:
    def test_ok_returns_the_contract(self, client, start_service, contexts):
        response = client.post(f"/api/projects/{CODE}/start", json=BODY)

        assert response.status_code == 200
        assert response.json() == {
            "code": CODE,
            "action": "promote",
            "previous_phase": 0,
            "current_phase": 1,
            "frozen_version": 1,
            "plan": {
                "project_type": "industrial",
                "scale": "medium",
                "weeks_by_phase": {"1": 2, "2": 2, "3": 4, "4": 5, "5": 8, "6": 40, "7": 4},
                "total": 65,
            },
        }
        context = contexts[0]
        start_service.execute.assert_called_once_with(context, CODE, "medium", WEEKS)
        assert context.role.value == "partner"

    def test_the_values_are_handed_raw_to_the_domain(self, client, start_service):
        start_service.execute.return_value = rejected(InvalidScale())

        response = client.post(f"/api/projects/{CODE}/start", json={"scale": "huge", "weeks": [0]})

        assert response.status_code == 422
        assert start_service.execute.call_args.args[2:] == ("huge", [0])

    @pytest.mark.parametrize(
        ("error", "status", "code"),
        [
            (NoAuthority(0, ["Socio", "Director"]), 403, "no_authority"),
            (InvalidScale(), 422, "invalid_scale"),
            (InvalidWeeks(), 422, "invalid_weeks"),
            (IncompleteDeliverable(["scoring"]), 422, "incomplete_deliverable"),
            (ProjectNotInOpportunityPhase(), 409, "project_not_in_opportunity_phase"),
            (PlanAlreadyConfirmed(), 409, "plan_already_confirmed"),
        ],
    )
    def test_rejections_map_to_status_and_detail(self, client, start_service, error, status, code):
        start_service.execute.return_value = rejected(error)

        response = client.post(f"/api/projects/{CODE}/start", json=BODY)

        assert response.status_code == status
        detail = response.json()["detail"]
        assert detail["code"] == code
        assert detail["message"]

    def test_no_authority_lists_who_can(self, client, start_service):
        start_service.execute.return_value = rejected(NoAuthority(0, ["Socio", "Director"]))

        detail = client.post(f"/api/projects/{CODE}/start", json=BODY).json()["detail"]

        assert detail["allowed"] == ["Socio", "Director"]

    def test_incomplete_deliverable_lists_what_is_missing(self, client, start_service):
        start_service.execute.return_value = rejected(IncompleteDeliverable(["scoring"]))

        detail = client.post(f"/api/projects/{CODE}/start", json=BODY).json()["detail"]

        assert detail["missing"] == ["scoring"]

    def test_unknown_project_is_404(self, client, start_service):
        start_service.execute.side_effect = ProjectNotFound(CODE)

        response = client.post(f"/api/projects/{CODE}/start", json=BODY)

        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "project_not_found"
        assert CODE in response.json()["detail"]["message"]

    @pytest.mark.parametrize(
        "body",
        [
            {},
            {"scale": "medium"},
            {"weeks": WEEKS},
            [1, 2],
            "medium",
            None,
        ],
    )
    def test_a_malformed_body_is_invalid_request(self, client, start_service, body):
        response = client.post(f"/api/projects/{CODE}/start", json=body)

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_request"
        start_service.execute.assert_not_called()

    def test_a_non_json_body_is_invalid_request(self, client, start_service):
        response = client.post(
            f"/api/projects/{CODE}/start",
            content=b"not json",
            headers={"content-type": "application/json"},
        )

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_request"
        start_service.execute.assert_not_called()

    def test_the_route_is_post_only(self, client):
        assert client.get(f"/api/projects/{CODE}/start").status_code == 405


class TestGetPlan:
    def test_returns_the_confirmed_plan(self, client, reader):
        response = client.get(f"/api/projects/{CODE}/plan")

        assert response.status_code == 200
        assert response.json() == {
            "project_type": "industrial",
            "scale": "medium",
            "weeks_by_phase": {"1": 2, "2": 2, "3": 4, "4": 5, "5": 8, "6": 40, "7": 4},
            "total": 65,
            "confirmed_at": "2026-10-24T10:00:05Z",
            "confirmed_by": "sample-user",
        }
        reader.read.assert_called_once_with(CODE)

    def test_without_a_confirmed_plan_it_is_404(self, client, reader):
        reader.read.side_effect = PlanNotFound()

        response = client.get(f"/api/projects/{CODE}/plan")

        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "plan_not_found"
        assert response.json()["detail"]["message"]

    def test_unknown_project_is_404(self, client, reader):
        reader.read.side_effect = ProjectNotFound(CODE)

        response = client.get(f"/api/projects/{CODE}/plan")

        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "project_not_found"
