"""Authentication and member management end to end on real Postgres (no Supabase, no network)."""

import json

import psycopg
import pytest

from backend.app.api.dependencies import get_settings, token_verifier
from backend.app.api.main import create_app
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.tests.api.auth_support import PAIR, real_verifier, supabase_settings
from backend.tests.study.infrastructure.jwt_helpers import claims, sign

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
SUB = "11111111-1111-1111-1111-111111111111"


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
            "INSERT INTO study_members (study_id, email, role, status, invited_by) VALUES "
            "(%s, 'ana@example.com', 'partner', 'invited', 'bootstrap'), "
            "(%s, 'bea@example.com', 'architect', 'invited', 'bootstrap'), "
            "(%s, 'cris@example.com', 'director', 'revoked', 'bootstrap'), "
            "(%s, 'dan@example.com', 'director', 'active', 'bootstrap')",
            (STUDY_A, STUDY_A, STUDY_A, STUDY_B),
        )
    return url


def make_client(url, **settings):
    from fastapi.testclient import TestClient

    configured = supabase_settings(database_url=url, **settings)
    app = create_app(configured)
    app.dependency_overrides[get_settings] = lambda: configured
    app.dependency_overrides[token_verifier] = real_verifier
    return TestClient(app)


def headers(email="ana@example.com", sub=SUB, **overrides):
    token = sign(PAIR, claims(email=email, sub=sub, **overrides))
    return {"Authorization": f"Bearer {token}"}


def raw_json(body):
    """httpx would fail to UTF-8-encode a lone surrogate; send it as a JSON escape instead."""
    return json.dumps(body)


def rows(url, sql, *params):
    with psycopg.connect(url) as admin:
        return admin.execute(sql, params).fetchall()


class TestSignIn:
    def test_an_invited_member_enters_and_is_activated_and_linked_to_the_subject(self, url):
        client = make_client(url)

        response = client.get("/api/members", headers=headers(aal="aal2"))

        assert response.status_code == 200
        assert rows(url, "SELECT status, user_id FROM study_members WHERE email = 'ana@example.com'") == [
            ("active", SUB)
        ]

    def test_the_activation_is_audited_once(self, url):
        client = make_client(url)

        client.get("/api/members", headers=headers(aal="aal2"))
        client.get("/api/members", headers=headers(aal="aal2"))

        assert rows(url, "SELECT user_id, entity, action, outcome FROM audit_events") == [
            (SUB, "member", "activate", "ok")
        ]

    def test_the_email_case_in_the_token_does_not_matter(self, url):
        client = make_client(url)

        response = client.get("/api/members", headers=headers(email="ANA@Example.com", aal="aal2"))

        assert response.status_code == 200

    def test_a_member_only_sees_the_members_of_their_own_study(self, url):
        client = make_client(url)

        emails = sorted(
            m["email"] for m in client.get("/api/members", headers=headers(aal="aal2")).json()["members"]
        )

        assert emails == ["ana@example.com", "bea@example.com", "cris@example.com"]

    def test_a_person_without_invitation_is_rejected(self, url):
        client = make_client(url)

        response = client.get("/api/members", headers=headers(email="eve@example.com"))

        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "not_invited"

    def test_a_revoked_member_is_rejected(self, url):
        client = make_client(url)

        response = client.get("/api/members", headers=headers(email="cris@example.com", aal="aal2"))

        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "member_revoked"

    def test_a_partner_with_aal1_is_rejected_and_stays_pending(self, url):
        client = make_client(url)

        response = client.get("/api/members", headers=headers(aal="aal1"))

        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "mfa_required"
        assert rows(url, "SELECT status FROM study_members WHERE email = 'ana@example.com'") == [
            ("invited",)
        ]
        assert rows(url, "SELECT count(*) FROM audit_events") == [(0,)]

    def test_an_architect_enters_with_aal1(self, url):
        client = make_client(url)

        response = client.get("/api/members", headers=headers(email="bea@example.com"))

        assert response.status_code == 200

    def test_an_unverified_email_cannot_claim_the_invitation(self, url):
        client = make_client(url)

        response = client.get(
            "/api/members",
            headers=headers(aal="aal2", user_metadata={"email_verified": False}),
        )

        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "email_not_verified"
        assert rows(url, "SELECT status, user_id FROM study_members WHERE email = 'ana@example.com'") == [
            ("invited", None)
        ]

    def test_another_subject_cannot_take_over_an_activated_account(self, url):
        client = make_client(url)
        client.get("/api/members", headers=headers(aal="aal2"))

        response = client.get(
            "/api/members",
            headers=headers(aal="aal2", sub="99999999-9999-9999-9999-999999999999"),
        )

        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "not_invited"

    def test_an_invalid_token_never_touches_the_data(self, url):
        client = make_client(url)

        response = client.get("/api/members", headers={"Authorization": "Bearer nope"})

        assert response.status_code == 401
        assert rows(url, "SELECT count(*) FROM audit_events") == [(0,)]


class TestManagingMembers:
    @pytest.fixture
    def client(self, url):
        return make_client(url)

    def test_a_partner_invites_a_member_and_it_is_audited(self, client, url):
        response = client.post(
            "/api/members/invitations",
            json={"email": "Eve@Example.com", "role": "architect", "qualifications": ["sponsor"]},
            headers=headers(aal="aal2"),
        )

        assert response.status_code == 201
        body = response.json()
        assert (body["email"], body["role"], body["status"], body["qualifications"]) == (
            "eve@example.com",
            "architect",
            "invited",
            ["sponsor"],
        )
        events = rows(
            url,
            "SELECT entity, entity_id, action, outcome, user_id FROM audit_events "
            "WHERE action = 'invite'",
        )
        assert events == [("member", body["id"], "invite", "ok", SUB)]

    def test_the_invited_person_can_then_enter(self, client):
        client.post(
            "/api/members/invitations",
            json={"email": "eve@example.com", "role": "architect"},
            headers=headers(aal="aal2"),
        )
        eve_sub = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"

        response = client.get("/api/members", headers=headers(email="eve@example.com", sub=eve_sub))

        assert response.status_code == 200

    def test_a_duplicate_is_a_conflict_even_with_other_casing(self, client):
        response = client.post(
            "/api/members/invitations",
            json={"email": "BEA@example.com", "role": "architect"},
            headers=headers(aal="aal2"),
        )

        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "member_already_exists"

    def test_an_architect_cannot_invite_and_the_refusal_is_audited(self, client, url):
        response = client.post(
            "/api/members/invitations",
            json={"email": "eve@example.com", "role": "architect"},
            headers=headers(email="bea@example.com"),
        )

        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "no_authority"
        assert rows(url, "SELECT count(*) FROM study_members WHERE email = 'eve@example.com'") == [(0,)]
        assert rows(url, "SELECT action, outcome FROM audit_events WHERE action = 'invite'") == [
            ("invite", "rejected")
        ]

    @pytest.mark.parametrize(
        "email", ["a\u0000b@example.com", "a\ud800b@example.com", "a" * 243 + "@example.com"]
    )
    def test_an_unstorable_or_too_long_email_is_422_for_a_partner(self, client, url, email):
        response = client.post(
            "/api/members/invitations",
            content=raw_json({"email": email, "role": "architect"}),
            headers={**headers(aal="aal2"), "Content-Type": "application/json"},
        )

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_email"
        assert rows(url, "SELECT count(*) FROM audit_events WHERE action = 'invite'") == [(0,)]

    @pytest.mark.parametrize(
        "email", ["a\u0000b@example.com", "a\ud800b@example.com", "a" * 300]
    )
    def test_without_authority_it_is_403_and_audited_even_with_a_bad_email(
        self, client, url, email
    ):
        response = client.post(
            "/api/members/invitations",
            content=raw_json({"email": email, "role": "architect"}),
            headers={**headers(email="bea@example.com"), "Content-Type": "application/json"},
        )

        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "no_authority"
        assert rows(
            url, "SELECT entity_id, outcome, new_value FROM audit_events WHERE action = 'invite'"
        ) == [("invitation", "rejected", {"role": "architect", "error": "no_authority"})]

    def test_a_rejected_invitation_never_stores_the_email(self, client, url):
        client.post(
            "/api/members/invitations",
            json={"email": "eve.private@example.com", "role": "partner"},
            headers=headers(email="bea@example.com"),
        )

        assert rows(url, "SELECT count(*) FROM audit_events WHERE audit_events::text LIKE %s", "%private%") == [(0,)]

    @pytest.mark.parametrize("claim", ["a\u0000b@example.com", "a" * 243 + "@example.com"])
    def test_a_signed_token_with_a_bad_email_is_401_not_500(self, client, claim):
        response = client.get("/api/members", headers=headers(email=claim, aal="aal2"))

        assert response.status_code == 401
        assert response.json()["detail"]["code"] == "unauthenticated"

    def test_a_partner_revokes_a_member_and_it_is_audited(self, client, url):
        bea = rows(url, "SELECT id::text FROM study_members WHERE email = 'bea@example.com'")[0][0]

        response = client.post(f"/api/members/{bea}/revoke", headers=headers(aal="aal2"))

        assert response.status_code == 200
        assert response.json()["status"] == "revoked"
        assert rows(
            url, "SELECT action, outcome, entity_id FROM audit_events WHERE action = 'revoke'"
        ) == [("revoke", "ok", bea)]

    def test_a_revoked_member_is_locked_out_immediately(self, client, url):
        bea = rows(url, "SELECT id::text FROM study_members WHERE email = 'bea@example.com'")[0][0]
        assert client.get("/api/members", headers=headers(email="bea@example.com")).status_code == 200

        client.post(f"/api/members/{bea}/revoke", headers=headers(aal="aal2"))
        response = client.get("/api/members", headers=headers(email="bea@example.com"))

        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "member_revoked"

    def test_revoking_a_member_of_another_study_is_not_found(self, client, url):
        dan = rows(url, "SELECT id::text FROM study_members WHERE email = 'dan@example.com'")[0][0]

        response = client.post(f"/api/members/{dan}/revoke", headers=headers(aal="aal2"))

        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "member_not_found"
        assert rows(url, "SELECT status FROM study_members WHERE email = 'dan@example.com'") == [
            ("active",)
        ]

    def test_revoking_twice_is_idempotent(self, client, url):
        bea = rows(url, "SELECT id::text FROM study_members WHERE email = 'bea@example.com'")[0][0]
        client.post(f"/api/members/{bea}/revoke", headers=headers(aal="aal2"))

        response = client.post(f"/api/members/{bea}/revoke", headers=headers(aal="aal2"))

        assert response.status_code == 200
        assert rows(url, "SELECT count(*) FROM audit_events WHERE action = 'revoke'") == [(1,)]


class TestDevModeKeepsWorking:
    def test_members_work_in_dev_mode_with_the_fictitious_context(self, url):
        from fastapi.testclient import TestClient

        from backend.tests.api.auth_support import dev_settings

        settings = dev_settings(database_url=url, dev_study_id=STUDY_A)
        app = create_app(settings)
        app.dependency_overrides[get_settings] = lambda: settings
        client = TestClient(app)

        created = client.post(
            "/api/members/invitations", json={"email": "eve@example.com", "role": "architect"}
        )
        listed = client.get("/api/members")

        assert created.status_code == 201
        assert "eve@example.com" in [m["email"] for m in listed.json()["members"]]
