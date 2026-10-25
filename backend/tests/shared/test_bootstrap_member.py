"""Bootstrap of the first partner: manual, idempotent, audited."""

import psycopg
import pytest

from backend.app.shared.bootstrap_member import StudyNotFound, bootstrap_member
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import Role
from backend.app.study.domain.errors import InvalidEmail

pytestmark = pytest.mark.integration

STUDY = "11111111-1111-1111-1111-111111111111"


@pytest.fixture
def url(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute("INSERT INTO studies (id, name) VALUES (%s, 'A (sample)')", (STUDY,))
    return url


def members(url):
    with psycopg.connect(url) as admin:
        return admin.execute(
            "SELECT email, role, status, invited_by, user_id FROM study_members"
        ).fetchall()


def test_creates_the_first_partner_as_a_pending_invitation(url):
    created = bootstrap_member(url, STUDY, "Ana@Example.com", Role.PARTNER)

    assert created is True
    assert members(url) == [("ana@example.com", "partner", "invited", "bootstrap", None)]


def test_is_idempotent(url):
    bootstrap_member(url, STUDY, "ana@example.com", Role.PARTNER)

    again = bootstrap_member(url, STUDY, "ANA@example.com", Role.PARTNER)

    assert again is False
    assert len(members(url)) == 1


def test_running_again_does_not_reset_an_activated_member(url):
    bootstrap_member(url, STUDY, "ana@example.com", Role.PARTNER)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute("UPDATE study_members SET status = 'active', user_id = 'sub-1'")

    bootstrap_member(url, STUDY, "ana@example.com", Role.PARTNER)

    assert members(url)[0][2:] == ("active", "bootstrap", "sub-1")


def test_leaves_an_audit_trace_once(url):
    bootstrap_member(url, STUDY, "ana@example.com", Role.PARTNER)
    bootstrap_member(url, STUDY, "ana@example.com", Role.PARTNER)

    with psycopg.connect(url) as admin:
        events = admin.execute(
            "SELECT user_id, entity, action, outcome FROM audit_events"
        ).fetchall()
    assert events == [("bootstrap", "member", "invite", "ok")]


def test_an_unknown_study_is_refused(url):
    with pytest.raises(StudyNotFound):
        bootstrap_member(url, "99999999-9999-9999-9999-999999999999", "ana@example.com", Role.PARTNER)

    assert members(url) == []


def test_an_invalid_email_is_refused(url):
    with pytest.raises(InvalidEmail):
        bootstrap_member(url, STUDY, "nope", Role.PARTNER)


def test_other_roles_are_allowed(url):
    bootstrap_member(url, STUDY, "ana@example.com", Role.ADMINISTRATION)

    assert members(url)[0][1] == "administration"
