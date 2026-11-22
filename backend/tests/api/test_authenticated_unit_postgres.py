"""One transaction per request (pilot: GET /api/projects/{code}) on real Postgres: who is
calling and the endpoint's work share it, with the same guarantees as two."""

import psycopg
import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import authenticated_unit, get_settings, token_verifier
from backend.app.api.main import create_app
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import Role
from backend.app.study.domain.ports import TokenClaims
from backend.tests.api.auth_support import (
    PAIR,
    dev_settings,
    real_verifier,
    supabase_settings,
)
from backend.tests.study.infrastructure.jwt_helpers import claims, sign

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
ANA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


@pytest.fixture
def url(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO studies (id, name) VALUES (%s, 'A (sample)'), (%s, 'B (sample)')",
            (STUDY_A, STUDY_B),
        )
        admin.execute(
            "INSERT INTO study_members (study_id, email, role, status, user_id, invited_by) "
            "VALUES (%s, 'ana@example.com', 'partner', 'active', %s, 'bootstrap'), "
            "(%s, 'cris@example.com', 'architect', 'revoked', NULL, 'bootstrap'), "
            "(%s, 'bea@example.com', 'architect', 'invited', NULL, 'bootstrap')",
            (STUDY_A, ANA, STUDY_A, STUDY_A),
        )
        admin.execute(
            "INSERT INTO projects (study_id, code, name, current_phase) VALUES "
            "(%s, 'P-A', 'P-A (sample)', 2), (%s, 'P-B', 'P-B (sample)', 0)",
            (STUDY_A, STUDY_B),
        )
    return url


def client_for(settings, **kwargs):
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[token_verifier] = real_verifier
    return TestClient(app, **kwargs)


def headers(email="ana@example.com", sub=ANA, aal="aal2"):
    return {"Authorization": f"Bearer {sign(PAIR, claims(email=email, sub=sub, aal=aal))}"}


class TestThePilotRoute:
    def test_answers_the_project_of_the_member_study(self, url):
        response = client_for(supabase_settings(database_url=url)).get(
            "/api/projects/P-A", headers=headers()
        )

        assert response.status_code == 200
        assert response.json() == {
            "code": "P-A",
            "name": "P-A (sample)",
            "current_phase": 2,
            "project_type": None,
        }

    def test_a_project_of_another_study_is_not_found(self, url):
        response = client_for(supabase_settings(database_url=url)).get(
            "/api/projects/P-B", headers=headers()
        )

        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "project_not_found"

    @pytest.mark.parametrize(
        ("email", "aal", "code"),
        [
            ("eve@example.com", "aal2", "not_invited"),
            ("cris@example.com", "aal2", "member_revoked"),
            ("ana@example.com", "aal1", "mfa_required"),
        ],
    )
    def test_who_may_not_enter_gets_the_same_403_as_before(self, url, email, aal, code):
        response = client_for(supabase_settings(database_url=url)).get(
            "/api/projects/P-A", headers=headers(email=email, sub=ANA, aal=aal)
        )

        assert response.status_code == 403
        assert response.json()["detail"]["code"] == code

    def test_a_failed_commit_never_answers_200(self, url, monkeypatch):
        def failing_commit(self):
            self.close()  # the connection drops while committing: the server rolls back
            raise psycopg.OperationalError("commit failed")

        monkeypatch.setattr(psycopg.Connection, "commit", failing_commit)
        client = client_for(supabase_settings(database_url=url), raise_server_exceptions=False)

        response = client.get("/api/projects/P-A", headers=headers())

        assert response.status_code == 500

    def test_dev_mode_reads_with_the_fictitious_context(self, url):
        client = client_for(dev_settings(database_url=url, dev_study_id=STUDY_A))

        response = client.get("/api/projects/P-A")

        assert (response.status_code, response.json()["code"]) == (200, "P-A")


class TestTheFirstSignIn:
    BEA = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

    def bea(self, url):
        with psycopg.connect(url) as admin:
            member = admin.execute(
                "SELECT status, user_id FROM study_members WHERE email = 'bea@example.com'"
            ).fetchone()
            events = admin.execute("SELECT user_id, action FROM audit_events").fetchall()
        return member, events

    def test_the_activation_is_kept_even_if_the_endpoint_then_fails(self, url):
        response = client_for(supabase_settings(database_url=url)).get(
            "/api/projects/P-NONE", headers=headers(email="bea@example.com", sub=self.BEA)
        )

        assert response.status_code == 404
        assert self.bea(url) == (("active", self.BEA), [(self.BEA, "activate")])

    def test_after_the_activation_the_work_still_runs_as_the_api_role_in_the_study(self, url):
        token_claims = TokenClaims(
            subject=self.BEA, email="bea@example.com", email_verified=True, aal="aal1"
        )

        with authenticated_unit(
            supabase_settings(database_url=url),
            real_verifier(),
            token_claims,
            lambda conn, context: conn,
        ) as (context, conn):
            role, study = conn.execute(
                "SELECT current_user, current_setting('app.study_id')"
            ).fetchone()
            codes = [r[0] for r in conn.execute("SELECT code FROM projects").fetchall()]

        assert (context.study_id, role, study, codes) == (STUDY_A, "rgb_app", STUDY_A, ["P-A"])


class TestTheUnit:
    def inside(self, settings, token_claims):
        with authenticated_unit(
            settings, real_verifier(), token_claims, lambda conn, context: conn
        ) as (context, conn):
            role, study = conn.execute(
                "SELECT current_user, current_setting('app.study_id')"
            ).fetchone()
            codes = [r[0] for r in conn.execute("SELECT code FROM projects").fetchall()]
        return context, role, study, codes

    def test_the_work_runs_as_the_api_role_in_the_member_study(self, url):
        token_claims = TokenClaims(
            subject=ANA, email="ana@example.com", email_verified=True, aal="aal2"
        )

        context, role, study, codes = self.inside(supabase_settings(database_url=url), token_claims)

        assert (context.study_id, context.role) == (STUDY_A, Role.PARTNER)
        assert (role, study, codes) == ("rgb_app", STUDY_A, ["P-A"])

    def test_without_claims_it_is_the_dev_context(self, url):
        context, role, study, codes = self.inside(
            dev_settings(database_url=url, dev_study_id=STUDY_B), None
        )

        assert (context.study_id, role, study, codes) == (STUDY_B, "rgb_app", STUDY_B, ["P-B"])
