"""AUTH_MODE=dev keeps today's behaviour; AUTH_MODE=supabase protects every business route."""

import re
import time
from contextlib import contextmanager

import pytest

from backend.app.api.main import create_app
from backend.app.study.domain.context import Role
from backend.app.study.domain.members import MemberStatus
from backend.app.study.domain.ports import Resolution
from backend.tests.api.auth_support import (
    PAIR,
    a_member,
    client_with,
    dev_settings,
    members_service_mock,
    supabase_client,
    supabase_settings,
)
from backend.tests.study.infrastructure.jwt_helpers import KeyPair, claims, sign

UNAUTHENTICATED = {
    "detail": {"code": "unauthenticated", "message": "Inicia sesión para continuar."}
}


def bearer(**overrides):
    return {"Authorization": f"Bearer {sign(PAIR, claims(**overrides))}"}


def business_routes(app):
    """(method, path with dummy parameters) of every route except the health check.

    Read from the OpenAPI document: FastAPI keeps included routers nested, so `app.routes` does
    not list their paths.
    """
    found = []
    for path, operations in app.openapi()["paths"].items():
        if path == "/api/health":
            continue
        concrete = re.sub(r"\{[^}]+\}", "00000000-0000-0000-0000-000000000001", path)
        for method in operations:
            found.append((method.upper(), concrete))
    return found


class TestDevMode:
    def test_dev_is_the_default_mode(self):
        assert dev_settings().auth_mode == "dev"

    def test_requests_work_without_any_token(self):
        service = members_service_mock()
        client = client_with(dev_settings(), None, service)

        response = client.get("/api/members")

        assert response.status_code == 200

    def test_the_fictitious_context_is_used_and_the_authenticator_never_runs(self):
        service = members_service_mock()

        @contextmanager
        def must_not_run():
            raise AssertionError("dev mode must not authenticate")
            yield  # pragma: no cover

        client = client_with(dev_settings(dev_role="architect"), must_not_run, service)

        client.get("/api/members", headers={"Authorization": "Bearer whatever"})

        context = service.list_members.call_args.args[0]
        assert (context.user_id, context.role) == ("sample-user", Role.ARCHITECT)

    def test_health_works(self):
        assert client_with(dev_settings()).get("/api/health").status_code == 200

    def test_a_production_environment_in_dev_mode_logs_a_warning(self, caplog):
        with caplog.at_level("WARNING"):
            create_app(dev_settings(environment="production"))

        assert "AUTH_MODE=dev" in caplog.text

    def test_a_non_production_environment_in_dev_mode_does_not_warn(self, caplog):
        with caplog.at_level("WARNING"):
            create_app(dev_settings(environment="development"))

        assert "AUTH_MODE=dev" not in caplog.text


class TestSupabaseModeRejectsUnauthenticatedRequests:
    @pytest.fixture
    def client(self):
        return supabase_client(Resolution(a_member(), activated=False), members_service_mock())

    def test_the_route_list_is_not_empty_and_includes_the_members_routes(self, client):
        routes = business_routes(client.app)

        assert len(routes) >= 15
        assert ("GET", "/api/members") in routes
        assert ("POST", "/api/members/invitations") in routes
        assert any(path.endswith("/revoke") for _, path in routes)

    def test_every_business_route_answers_401_without_a_token(self, client):
        wrong = []
        for method, path in business_routes(client.app):
            response = client.request(method, path)
            if response.status_code != 401 or response.json() != UNAUTHENTICATED:
                wrong.append((method, path, response.status_code))

        assert wrong == []

    @pytest.mark.parametrize(
        "authorization",
        [
            "Bearer garbage",
            "Bearer ",
            "Bearer",
            "Basic dXNlcjpwYXNz",
            "garbage",
            "bearer",
        ],
    )
    def test_every_business_route_answers_401_with_a_malformed_or_invalid_credential(
        self, client, authorization
    ):
        wrong = []
        for method, path in business_routes(client.app):
            response = client.request(method, path, headers={"Authorization": authorization})
            if response.status_code != 401 or response.json() != UNAUTHENTICATED:
                wrong.append((method, path, response.status_code))

        assert wrong == []

    def test_every_business_route_rejects_a_token_signed_with_another_key(self, client):
        token = sign(KeyPair("route-key"), claims())
        wrong = []
        for method, path in business_routes(client.app):
            response = client.request(
                method, path, headers={"Authorization": f"Bearer {token}"}
            )
            if response.status_code != 401:
                wrong.append((method, path, response.status_code))

        assert wrong == []

    def test_every_business_route_rejects_an_expired_token(self, client):
        now = int(time.time())
        headers = bearer(exp=now - 3600, iat=now - 7200)
        wrong = [
            (method, path)
            for method, path in business_routes(client.app)
            if client.request(method, path, headers=headers).status_code != 401
        ]

        assert wrong == []

    def test_the_401_asks_for_a_bearer_credential(self, client):
        response = client.get("/api/members")

        assert response.headers["www-authenticate"] == "Bearer"

    def test_the_health_check_stays_public(self, client):
        assert client.get("/api/health").json() == {"status": "ok"}

    def test_cors_preflight_needs_no_token(self, client):
        response = client.options(
            "/api/members",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
        )

        assert response.status_code == 200


class TestSupabaseModeWithAValidToken:
    def test_a_member_in_good_standing_gets_in_with_their_own_context(self):
        service = members_service_mock([a_member()])
        client = supabase_client(Resolution(a_member(role=Role.DIRECTOR), activated=False), service)

        response = client.get("/api/members", headers=bearer(aal="aal2"))

        assert response.status_code == 200
        context = service.list_members.call_args.args[0]
        assert (context.study_id, context.role) == (
            "00000000-0000-0000-0000-00000000a001",
            Role.DIRECTOR,
        )
        assert context.user_id == "11111111-1111-1111-1111-111111111111"

    def test_the_dev_settings_do_not_leak_into_the_real_context(self):
        service = members_service_mock()
        client = supabase_client(Resolution(a_member(role=Role.ARCHITECT), activated=False), service)

        client.get("/api/members", headers=bearer())

        context = service.list_members.call_args.args[0]
        assert context.user_id != "sample-user"
        assert context.role is Role.ARCHITECT

    def test_not_invited(self):
        client = supabase_client(None, members_service_mock())

        response = client.get("/api/members", headers=bearer())

        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "not_invited"
        assert response.json()["detail"]["message"].startswith("Tu cuenta no tiene invitación")

    def test_revoked(self):
        resolution = Resolution(a_member(status=MemberStatus.REVOKED), activated=False)
        client = supabase_client(resolution, members_service_mock())

        response = client.get("/api/members", headers=bearer(aal="aal2"))

        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "member_revoked"

    def test_mfa_required_for_a_partner_with_aal1(self):
        client = supabase_client(
            Resolution(a_member(role=Role.PARTNER), activated=False), members_service_mock()
        )

        response = client.get("/api/members", headers=bearer(aal="aal1"))

        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "mfa_required"

    def test_an_architect_does_not_need_two_factor(self):
        client = supabase_client(
            Resolution(a_member(role=Role.ARCHITECT), activated=False), members_service_mock()
        )

        assert client.get("/api/members", headers=bearer(aal="aal1")).status_code == 200

    def test_unverified_email(self):
        client = supabase_client(Resolution(a_member(), activated=False), members_service_mock())

        response = client.get(
            "/api/members",
            headers=bearer(aal="aal2", user_metadata={"email_verified": False}),
        )

        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "email_not_verified"

    def test_the_business_logic_is_never_reached_when_authentication_fails(self):
        service = members_service_mock()
        client = supabase_client(None, service)

        client.post(
            "/api/members/invitations",
            json={"email": "x@example.com", "role": "architect"},
            headers=bearer(),
        )

        service.invite.assert_not_called()


def test_supabase_settings_helper_is_in_supabase_mode():
    assert supabase_settings().auth_mode == "supabase"
