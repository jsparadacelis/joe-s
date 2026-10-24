"""Pause routes: contract shapes, statuses and Spanish errors."""

from contextlib import contextmanager
from datetime import date
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import get_settings, pause_unit_of_work
from backend.app.api.main import create_app
from backend.app.shared.config import Settings
from backend.app.timing.application.pause_service import (
    PauseHistory,
    PauseResult,
    PauseService,
    PauseView,
)
from backend.app.timing.domain.errors import (
    AlreadyPaused,
    CannotPauseOpportunity,
    InvalidField,
    NotAllowed,
    NotPaused,
    ProjectNotFound,
    RequiredField,
)
from backend.app.timing.domain.pause import Pause
from backend.app.timing.domain.time_tracking import PauseReason

CODE = "PRY-2026-001"
BODY = {"reason": "client_wait", "expected_resumption": "2026-11-09"}


def a_pause(**overrides):
    values = {
        "id": "7d3f0c1e-0000-4000-8000-000000000001",
        "project_id": "project-1",
        "phase": 1,
        "reason": PauseReason.CLIENT_WAIT,
        "started_on": date(2026, 10, 24),
        "expected_resumption": date(2026, 11, 9),
        "opened_by": "demo-user",
    }
    values.update(overrides)
    return Pause(**values)


def a_view(overdue=False, days=0, **overrides):
    return PauseView(a_pause(**overrides), overdue, days)


@pytest.fixture
def service():
    return create_autospec(PauseService, spec_set=True, instance=True)


@pytest.fixture
def client(service):
    app = create_app(Settings(_env_file=None))
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None)
    contexts = []

    @contextmanager
    def fake_unit_of_work(context):
        contexts.append(context)
        yield service

    app.dependency_overrides[pause_unit_of_work] = lambda: fake_unit_of_work
    test_client = TestClient(app)
    test_client.contexts = contexts
    return test_client


OPEN_JSON = {
    "id": "7d3f0c1e-0000-4000-8000-000000000001",
    "phase": 1,
    "reason": "client_wait",
    "started_on": "2026-10-24",
    "expected_resumption": "2026-11-09",
    "resumed_on": None,
    "overdue": False,
    "days_overdue": 0,
}


class TestPause:
    def test_returns_201_with_the_open_pause(self, client, service):
        service.pause.return_value = PauseResult(view=a_view())

        response = client.post(f"/api/projects/{CODE}/pause", json=BODY)

        assert response.status_code == 201
        assert response.json() == OPEN_JSON
        _, code, data = service.pause.call_args.args
        assert (code, data) == (CODE, BODY)

    def test_passes_the_request_context(self, client, service):
        service.pause.return_value = PauseResult(view=a_view())

        client.post(f"/api/projects/{CODE}/pause", json=BODY)

        assert service.pause.call_args.args[0] is client.contexts[0]

    @pytest.mark.parametrize(
        ("error", "status", "field"),
        [
            (NotAllowed(), 403, None),
            (AlreadyPaused(), 409, None),
            (CannotPauseOpportunity(), 422, None),
            (RequiredField("reason"), 422, "reason"),
            (
                InvalidField("expected_resumption", "no puede ser anterior a hoy"),
                422,
                "expected_resumption",
            ),
        ],
    )
    def test_business_errors_use_the_contract_status_code_and_message(
        self, client, service, error, status, field
    ):
        service.pause.return_value = PauseResult(error=error)

        response = client.post(f"/api/projects/{CODE}/pause", json=BODY)

        assert response.status_code == status
        detail = {"code": error.code, "message": error.message}
        if field:
            detail["field"] = field
        assert response.json() == {"detail": detail}

    def test_unknown_project_is_404(self, client, service):
        service.pause.side_effect = ProjectNotFound(CODE)

        response = client.post(f"/api/projects/{CODE}/pause", json=BODY)

        assert response.status_code == 404
        assert response.json() == {
            "detail": {"code": "project_not_found", "message": f"No existe el proyecto {CODE}."}
        }

    @pytest.mark.parametrize("body", [[], "text", 5])
    def test_a_body_that_is_not_an_object_is_invalid_request(self, client, body):
        response = client.post(f"/api/projects/{CODE}/pause", json=body)

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_request"

    def test_wrong_value_types_reach_the_domain_validation(self, client, service):
        service.pause.return_value = PauseResult(error=InvalidField("reason", "x"))

        client.post(f"/api/projects/{CODE}/pause", json={"reason": 3})

        assert service.pause.call_args.args[2] == {"reason": 3}


class TestResume:
    def test_returns_200_with_the_closed_pause(self, client, service):
        service.resume.return_value = PauseResult(
            view=a_view(resumed_on=date(2026, 10, 30), closed_by="demo-user")
        )

        response = client.post(f"/api/projects/{CODE}/resume")

        assert response.status_code == 200
        assert response.json() == {**OPEN_JSON, "resumed_on": "2026-10-30"}
        assert service.resume.call_args.args[1] == CODE

    @pytest.mark.parametrize(("error", "status"), [(NotAllowed(), 403), (NotPaused(), 409)])
    def test_business_errors(self, client, service, error, status):
        service.resume.return_value = PauseResult(error=error)

        response = client.post(f"/api/projects/{CODE}/resume")

        assert response.status_code == status
        assert response.json() == {"detail": {"code": error.code, "message": error.message}}

    def test_unknown_project_is_404(self, client, service):
        service.resume.side_effect = ProjectNotFound(CODE)

        assert client.post(f"/api/projects/{CODE}/resume").status_code == 404


class TestPauses:
    def test_returns_active_and_history(self, client, service):
        service.history.return_value = PauseHistory(
            active=a_view(overdue=True, days=3),
            history=[
                a_view(id="p2", resumed_on=date(2026, 10, 1)),
                a_view(id="p1", resumed_on=date(2026, 9, 1)),
            ],
        )

        response = client.get(f"/api/projects/{CODE}/pauses")

        assert response.status_code == 200
        body = response.json()
        assert body["active"] == {**OPEN_JSON, "overdue": True, "days_overdue": 3}
        assert [p["id"] for p in body["history"]] == ["p2", "p1"]
        assert body["history"][0]["resumed_on"] == "2026-10-01"

    def test_no_active_pause(self, client, service):
        service.history.return_value = PauseHistory(active=None, history=[])

        assert client.get(f"/api/projects/{CODE}/pauses").json() == {"active": None, "history": []}

    def test_unknown_project_is_404(self, client, service):
        service.history.side_effect = ProjectNotFound(CODE)

        assert client.get(f"/api/projects/{CODE}/pauses").status_code == 404
