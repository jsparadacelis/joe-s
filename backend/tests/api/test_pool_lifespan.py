import pytest
from fastapi.testclient import TestClient

from backend.app.api.main import create_app
from backend.app.shared.config import Settings
from backend.app.shared.db import close_pools, study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role

pytestmark = pytest.mark.integration


def a_context():
    return RequestContext(
        study_id="11111111-1111-1111-1111-111111111111", user_id="u", role=Role.PARTNER
    )


def pid(url):
    with study_transaction(url, a_context()) as conn:
        return conn.execute("SELECT pg_backend_pid()").fetchone()[0]


@pytest.fixture
def url(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    yield url
    close_pools()


def test_the_app_reuses_connections_while_it_runs_when_a_pool_is_configured(url):
    app = create_app(Settings(_env_file=None, database_url=url, db_pool_max=2))

    with TestClient(app):
        assert len({pid(url) for _ in range(6)}) <= 2


def test_the_pool_is_closed_when_the_app_stops(url):
    app = create_app(Settings(_env_file=None, database_url=url, db_pool_max=2))

    with TestClient(app):
        pass

    assert len({pid(url) for _ in range(3)}) == 3


def test_without_a_configured_pool_every_transaction_opens_its_own_connection(url):
    app = create_app(Settings(_env_file=None, database_url=url))

    with TestClient(app):
        assert len({pid(url) for _ in range(3)}) == 3
