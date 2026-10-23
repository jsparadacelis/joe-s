import psycopg
import pytest

from backend.app.shared.db import study_transaction
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
