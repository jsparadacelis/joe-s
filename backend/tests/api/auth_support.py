"""Shared helpers for the authentication route tests (no network, no real Supabase)."""

from __future__ import annotations

from contextlib import contextmanager
from unittest.mock import create_autospec

from fastapi.testclient import TestClient

from backend.app.api.dependencies import (
    authenticate_unit_of_work,
    get_settings,
    members_unit_of_work,
    token_verifier,
)
from backend.app.api.main import create_app
from backend.app.audit.domain.ports import AuditLog
from backend.app.shared.config import Settings
from backend.app.study.application.authenticate import Authenticate
from backend.app.study.application.manage_members import ManageMembers
from backend.app.study.domain.context import Role
from backend.app.study.domain.members import Member, MemberStatus
from backend.app.study.domain.ports import MemberResolver, Resolution
from backend.app.study.infrastructure.supabase_jwt_verifier import SupabaseJwtVerifier
from backend.tests.study.infrastructure.jwt_helpers import SUPABASE_URL, KeyPair, jwks

STUDY = "00000000-0000-0000-0000-00000000a001"

PAIR = KeyPair("route-key")


def real_verifier() -> SupabaseJwtVerifier:
    return SupabaseJwtVerifier(SUPABASE_URL, lambda url: jwks(PAIR))


def a_member(**overrides) -> Member:
    values = {
        "id": "member-1",
        "study_id": STUDY,
        "email": "ana@example.com",
        "role": Role.PARTNER,
        "status": MemberStatus.ACTIVE,
        "user_id": "11111111-1111-1111-1111-111111111111",
    }
    return Member(**{**values, **overrides})


def supabase_settings(**overrides) -> Settings:
    values = {"auth_mode": "supabase", "supabase_url": SUPABASE_URL}
    return Settings(_env_file=None, **{**values, **overrides})


def dev_settings(**overrides) -> Settings:
    return Settings(_env_file=None, **overrides)


def supabase_client(resolution: Resolution | None, members_service=None) -> TestClient:
    """App in supabase mode: real verifier with generated keys, the member lookup simulated."""
    resolver = create_autospec(MemberResolver, spec_set=True, instance=True)
    resolver.resolve.return_value = resolution
    audit_log = create_autospec(AuditLog, spec_set=True, instance=True)

    @contextmanager
    def fake_authenticate_unit():
        yield Authenticate(real_verifier(), resolver, audit_log)

    return client_with(supabase_settings(), fake_authenticate_unit, members_service)


def client_with(settings: Settings, authenticate_unit=None, members_service=None) -> TestClient:
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[token_verifier] = real_verifier
    if authenticate_unit is not None:
        app.dependency_overrides[authenticate_unit_of_work] = lambda: authenticate_unit
    if members_service is not None:

        @contextmanager
        def fake_members_unit(context):
            yield members_service

        app.dependency_overrides[members_unit_of_work] = lambda: fake_members_unit
    return TestClient(app)


def members_service_mock(listed=()):
    service = create_autospec(ManageMembers, spec_set=True, instance=True)
    service.list_members.return_value = list(listed)
    return service
