import psycopg
import pytest

from backend.app.shared.config import Settings
from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.shared.seed_dev import (
    DEV_STUDY_NAME,
    NonLocalDatabase,
    assert_local_database,
    seed_dev_study,
)
from backend.app.study.domain.context import RequestContext, Role

STUDY_ID = Settings(_env_file=None).dev_study_id


class TestAssertLocalDatabase:
    @pytest.mark.parametrize(
        "url",
        [
            "postgresql://rgb:rgb@localhost:54329/rgb",
            "postgresql://rgb:rgb@127.0.0.1:5432/rgb",
            "postgresql://rgb:rgb@db:5432/rgb",
        ],
    )
    def test_accepts_local_hosts(self, url):
        assert_local_database(url)

    @pytest.mark.parametrize(
        "url",
        [
            "postgresql://postgres.abc:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres",
            "postgresql://rgb:rgb@10.0.0.5:5432/rgb",
            "postgresql:///rgb?host=/cloudsql/project:region:instance",
        ],
    )
    def test_refuses_remote_hosts_without_leaking_credentials(self, url):
        with pytest.raises(NonLocalDatabase) as error:
            assert_local_database(url)

        assert "secret" not in str(error.value)

    def test_force_allows_any_host(self):
        assert_local_database("postgresql://u:p@db.example.com/x", force=True)


@pytest.mark.integration
class TestSeedDevStudy:
    @pytest.fixture
    def url(self, schema_url):
        url, _ = schema_url
        apply_migrations(url, MIGRATIONS_DIR)
        return url

    def _context(self):
        return RequestContext(study_id=STUDY_ID, user_id="sample-user", role=Role.PARTNER)

    def test_creates_the_fictitious_study_the_api_runs_as(self, url):
        assert seed_dev_study(url, STUDY_ID) is True

        with study_transaction(url, self._context()) as conn:
            rows = conn.execute("SELECT id::text, name FROM studies").fetchall()
        assert rows == [(STUDY_ID, DEV_STUDY_NAME)]

    def test_is_idempotent(self, url):
        seed_dev_study(url, STUDY_ID)

        assert seed_dev_study(url, STUDY_ID) is False

        with psycopg.connect(url) as conn:
            conn.execute("SELECT set_config('app.study_id', %s, true)", (STUDY_ID,))
            count = conn.execute("SELECT count(*) FROM studies").fetchone()[0]
        assert count == 1

    def test_makes_plan_setting_writes_possible(self, url):
        seed_dev_study(url, STUDY_ID)

        with study_transaction(url, self._context()) as conn:
            conn.execute(
                "INSERT INTO plan_templates (study_id, project_type, weeks) "
                "VALUES (%s, 'industrial', ARRAY[1,1,1,1,1,1,1])",
                (STUDY_ID,),
            )
