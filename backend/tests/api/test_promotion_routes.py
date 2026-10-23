from contextlib import contextmanager
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import get_settings, unit_of_work
from backend.app.api.main import create_app
from backend.app.lifecycle.application.promotion_service import PromotionService, Transition
from backend.app.lifecycle.domain.errors import (
    ActionNotAllowed,
    IncompleteDeliverable,
    NoAuthority,
    NoNextPhase,
    ProjectNotFound,
    ReasonRequired,
)
from backend.app.shared.config import Settings


@pytest.fixture
def service():
    return create_autospec(PromotionService, spec_set=True, instance=True)


@pytest.fixture
def client(service):
    app = create_app(Settings(_env_file=None))
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None)

    @contextmanager
    def fake_unit_of_work(context):
        yield service

    app.dependency_overrides[unit_of_work] = lambda: fake_unit_of_work
    return TestClient(app)


def ok(**overrides):
    values = {
        "ok": True,
        "action": "promote",
        "previous_phase": 2,
        "current_phase": 3,
        "frozen_version": 1,
        "error": None,
    }
    return Transition(**{**values, **overrides})


def rejected(error, action="promote", phase=2):
    return Transition(
        ok=False,
        action=action,
        previous_phase=phase,
        current_phase=phase,
        frozen_version=None,
        error=error,
    )


class TestPromote:
    def test_returns_the_new_phase_and_the_frozen_version(self, client, service):
        service.promote.return_value = ok()

        response = client.post("/api/projects/PRY-EJ-001/promote")

        assert response.status_code == 200
        assert response.json() == {
            "code": "PRY-EJ-001",
            "action": "promote",
            "previous_phase": 2,
            "current_phase": 3,
            "frozen_version": 1,
        }

    def test_without_authority_is_403_and_says_who_can(self, client, service):
        service.promote.return_value = rejected(
            NoAuthority(phase=2, allowed=["Director de proyecto"])
        )

        response = client.post("/api/projects/PRY-EJ-001/promote")

        assert response.status_code == 403
        body = response.json()["detail"]
        assert body["code"] == "no_authority"
        assert body["allowed"] == ["Director de proyecto"]
        assert "Director de proyecto" in body["message"]

    def test_incomplete_deliverable_is_422_and_lists_what_is_missing(self, client, service):
        service.promote.return_value = rejected(
            IncompleteDeliverable(["aprobación del entregable"])
        )

        response = client.post("/api/projects/PRY-EJ-001/promote")

        assert response.status_code == 422
        body = response.json()["detail"]
        assert body["code"] == "incomplete_deliverable"
        assert body["missing"] == ["aprobación del entregable"]
        assert "aprobación del entregable" in body["message"]

    def test_closing_phase_is_409(self, client, service):
        service.promote.return_value = rejected(NoNextPhase(), phase=7)

        response = client.post("/api/projects/PRY-EJ-001/promote")

        assert response.status_code == 409

    def test_unknown_project_is_404(self, client, service):
        service.promote.side_effect = ProjectNotFound("PRY-X")

        response = client.post("/api/projects/PRY-X/promote")

        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "project_not_found"


class TestHoldAndDoNotPursue:
    def test_hold_sends_the_reason(self, client, service):
        service.hold.return_value = ok(action="hold", current_phase=2, frozen_version=None)

        response = client.post(
            "/api/projects/PRY-EJ-001/hold", json={"reason": "Something is missing"}
        )

        assert response.status_code == 200
        assert service.hold.call_args.args[1:] == ("PRY-EJ-001", "Something is missing")

    def test_hold_without_a_reason_in_the_body_is_422(self, client, service):
        response = client.post("/api/projects/PRY-EJ-001/hold", json={})

        assert response.status_code == 422
        service.hold.assert_not_called()

    def test_blank_reason_rejected_by_the_service_is_422(self, client, service):
        service.hold.return_value = rejected(ReasonRequired("hold"), action="hold")

        response = client.post("/api/projects/PRY-EJ-001/hold", json={"reason": " "})

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "reason_required"

    def test_do_not_pursue_outside_phase_zero_is_409(self, client, service):
        service.do_not_pursue.return_value = rejected(
            ActionNotAllowed("do_not_pursue"), "do_not_pursue", 3
        )

        response = client.post("/api/projects/PRY-EJ-001/do-not-pursue", json={"reason": "x"})

        assert response.status_code == 409

    def test_do_not_pursue_ok(self, client, service):
        service.do_not_pursue.return_value = ok(
            action="do_not_pursue", previous_phase=0, current_phase=0, frozen_version=None
        )

        response = client.post(
            "/api/projects/PRY-EJ-001/do-not-pursue", json={"reason": "Threshold"}
        )

        assert response.status_code == 200
