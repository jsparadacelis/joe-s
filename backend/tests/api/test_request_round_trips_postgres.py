"""Round trips to Postgres of an authenticated request, as in production: pooled connections,
`AUTH_MODE=supabase`, a real token verifier with generated keys."""

import psycopg
import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import get_settings, token_verifier
from backend.app.api.main import create_app
from backend.app.shared.db import close_pools
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.tests.api.auth_support import PAIR, real_verifier, supabase_settings
from backend.tests.study.infrastructure.jwt_helpers import claims, sign
from backend.tests.support.statements import statement_log  # noqa: F401 (fixture)

pytestmark = pytest.mark.integration

STUDY = "11111111-1111-1111-1111-111111111111"
SUB = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
HEADERS = {
    "Authorization": "Bearer " + sign(PAIR, claims(email="ana@example.com", sub=SUB, aal="aal2"))
}


@pytest.fixture
def url(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute("INSERT INTO studies (id, name) VALUES (%s, 'A (sample)')", (STUDY,))
        admin.execute(
            "INSERT INTO study_members (study_id, email, role, status, user_id, invited_by) "
            "VALUES (%s, 'ana@example.com', 'partner', 'active', %s, 'bootstrap')",
            (STUDY, SUB),
        )
        admin.execute(
            "INSERT INTO projects (study_id, code, name, current_phase) "
            "VALUES (%s, 'P-1', 'P-1 (sample)', 0)",
            (STUDY,),
        )
    yield url
    close_pools()


@pytest.fixture
def client(url, statement_log):  # noqa: F811
    settings = supabase_settings(database_url=url, db_pool_max=2)
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[token_verifier] = real_verifier
    with TestClient(app) as client:
        assert client.get("/api/projects/P-1", headers=HEADERS).status_code == 200  # warm pool
        yield client


def label(statement):
    """A short name per round trip, so the expected sequences read at a glance."""
    if statement == "":
        return "check"  # the pool's liveness probe
    if statement in ("BEGIN", "COMMIT", "ROLLBACK"):
        return statement
    if statement == "SET LOCAL ROLE rgb_app":
        return "role"
    if "resolve_member" in statement:
        return "resolve+study" if "set_config" in statement else "resolve"
    if "set_config('app.study_id'" in statement:
        return "study"
    return "query"


def round_trips(client, statement_log, path):  # noqa: F811
    statement_log.reset()
    response = client.get(path, headers=HEADERS)
    assert response.status_code == 200
    return [label(s) for s in statement_log.statements()]


def test_the_counter_sees_every_round_trip_of_a_connection(url, statement_log):  # noqa: F811
    with psycopg.Connection.connect(url) as conn:  # what the pool calls
        statement_log.reset()
        conn.execute("SELECT 1")
        conn.execute("SELECT %s::int", (2,))
        conn.commit()

    assert statement_log.statements() == ["BEGIN", "SELECT 1", "SELECT $1::int", "COMMIT"]


def test_reading_a_project_costs_five_round_trips(client, statement_log):  # noqa: F811
    # Who is calling and the endpoint's work share one transaction, on a connection the pool
    # does not need to probe because it was used moments ago.
    assert round_trips(client, statement_log, "/api/projects/P-1") == [
        *["BEGIN", "role", "resolve+study", "query", "COMMIT"],
    ]


def test_the_endpoints_not_migrated_yet_keep_two_transactions(client, statement_log):  # noqa: F811
    assert round_trips(client, statement_log, "/api/portfolio") == [
        *["BEGIN", "role", "resolve+study", "COMMIT"],
        *["BEGIN", "role", "study", "query", "COMMIT"],
    ]
