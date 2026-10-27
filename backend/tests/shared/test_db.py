import psycopg
import pytest

from backend.app.shared.db import (
    close_pools,
    identity_transaction,
    open_pool,
    study_transaction,
)
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role

pytestmark = pytest.mark.integration

STUDIO = "11111111-1111-1111-1111-111111111111"


@pytest.fixture
def url(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    return url


def a_context(study_id=STUDIO):
    return RequestContext(study_id=study_id, user_id="demo-user", role=Role.PARTNER)


class TestStudyTransaction:
    def test_sets_study_and_runs_as_the_restricted_role(self, url):
        with study_transaction(url, a_context()) as conn:
            study = conn.execute("SELECT app_study_id()").fetchone()[0]
            role = conn.execute("SELECT current_user").fetchone()[0]

        assert (study, role) == (STUDIO, "rgb_app")

    def test_setting_does_not_leak_after_commit(self, url):
        with study_transaction(url, a_context()):
            pass

        with psycopg.connect(url) as conn:
            leaked = conn.execute("SELECT app_study_id()").fetchone()[0]
        assert leaked in (None, "")

    def test_commits_on_success_and_rolls_back_on_error(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute("INSERT INTO studies (id, name) VALUES (%s, 'A (sample)')", (STUDIO,))

        with study_transaction(url, a_context()) as conn:
            conn.execute("UPDATE studies SET name = 'Renamed (sample)'")
        with pytest.raises(RuntimeError):
            with study_transaction(url, a_context()) as conn:
                conn.execute("UPDATE studies SET name = 'Must not stay'")
                raise RuntimeError("failure")

        with psycopg.connect(url) as admin:
            name = admin.execute("SELECT name FROM studies").fetchone()[0]
        assert name == "Renamed (sample)"


@pytest.fixture
def pooled(url):
    open_pool(url, min_size=1, max_size=1)
    yield url
    close_pools()


def backend_pid(conn):
    return conn.execute("SELECT pg_backend_pid()").fetchone()[0]


class TestPool:
    def test_reuses_the_connection_instead_of_opening_one_per_transaction(self, pooled):
        with study_transaction(pooled, a_context()) as conn:
            first = backend_pid(conn)
        with study_transaction(pooled, a_context()) as conn:
            second = backend_pid(conn)

        assert first == second

    def test_study_and_role_do_not_leak_to_the_next_user_of_the_connection(self, pooled):
        with study_transaction(pooled, a_context()):
            pass

        with identity_transaction(pooled) as conn:
            study = conn.execute("SELECT app_study_id()").fetchone()[0]
            role = conn.execute("SELECT current_user").fetchone()[0]

        assert study in (None, "")
        assert role == "rgb_app"

    def test_rolls_back_on_error_and_the_connection_stays_usable(self, pooled):
        with psycopg.connect(pooled, autocommit=True) as admin:
            admin.execute("INSERT INTO studies (id, name) VALUES (%s, 'A (sample)')", (STUDIO,))

        with pytest.raises(RuntimeError):
            with study_transaction(pooled, a_context()) as conn:
                conn.execute("UPDATE studies SET name = 'Must not stay'")
                raise RuntimeError("failure")
        with study_transaction(pooled, a_context()) as conn:
            name = conn.execute("SELECT name FROM studies").fetchone()[0]

        assert name == "A (sample)"

    def test_commits_on_success(self, pooled):
        with psycopg.connect(pooled, autocommit=True) as admin:
            admin.execute("INSERT INTO studies (id, name) VALUES (%s, 'A (sample)')", (STUDIO,))

        with study_transaction(pooled, a_context()) as conn:
            conn.execute("UPDATE studies SET name = 'Renamed (sample)'")

        with psycopg.connect(pooled) as admin:
            assert admin.execute("SELECT name FROM studies").fetchone()[0] == "Renamed (sample)"

    def test_without_a_pool_each_transaction_opens_its_own_connection(self, url):
        with study_transaction(url, a_context()) as conn:
            first = backend_pid(conn)
        with study_transaction(url, a_context()) as conn:
            second = backend_pid(conn)

        assert first != second

    def test_closing_the_pools_goes_back_to_direct_connections(self, url):
        open_pool(url, min_size=1, max_size=1)
        close_pools()

        with study_transaction(url, a_context()) as conn:
            assert conn.execute("SELECT 1").fetchone()[0] == 1

    def test_opening_twice_for_the_same_url_keeps_one_pool(self, url):
        open_pool(url, min_size=1, max_size=1)
        open_pool(url, min_size=1, max_size=1)
        try:
            with study_transaction(url, a_context()) as conn:
                assert conn.execute("SELECT 1").fetchone()[0] == 1
        finally:
            close_pools()
