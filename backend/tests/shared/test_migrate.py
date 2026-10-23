import uuid

import psycopg
import pytest

from backend.app.shared.migrate import apply_migrations

pytestmark = pytest.mark.integration


@pytest.fixture
def schema_url(database_url):
    """URL con un esquema propio y efímero para no pisar otros tests."""
    schema = f"t_{uuid.uuid4().hex[:8]}"
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute(f"CREATE SCHEMA {schema}")
    separator = "&" if "?" in database_url else "?"
    yield f"{database_url}{separator}options=-csearch_path%3D{schema}", schema
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute(f"DROP SCHEMA {schema} CASCADE")


@pytest.fixture
def migrations_dir(tmp_path):
    (tmp_path / "001_a.sql").write_text("CREATE TABLE a (id int);")
    (tmp_path / "002_b.sql").write_text("CREATE TABLE b (id int);")
    return tmp_path


def _tables(url):
    with psycopg.connect(url) as conn:
        rows = conn.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()"
        ).fetchall()
    return {r[0] for r in rows}


class TestApplyMigrations:
    def test_applies_files_in_order_and_records_them(self, schema_url, migrations_dir):
        url, _ = schema_url

        applied = apply_migrations(url, migrations_dir)

        assert applied == ["001_a.sql", "002_b.sql"]
        assert {"a", "b", "schema_migrations"} <= _tables(url)

    def test_second_run_applies_nothing(self, schema_url, migrations_dir):
        url, _ = schema_url
        apply_migrations(url, migrations_dir)

        applied = apply_migrations(url, migrations_dir)

        assert applied == []

    def test_failed_migration_rolls_back_and_is_not_recorded(self, schema_url, tmp_path):
        url, _ = schema_url
        (tmp_path / "001_bad.sql").write_text("CREATE TABLE ok (id int); SELECT boom();")

        with pytest.raises(psycopg.Error):
            apply_migrations(url, tmp_path)

        assert "ok" not in _tables(url)


class TestBaselineMigration:
    def test_estudio_id_helper_reads_the_session_setting(self, schema_url):
        from backend.app.shared.migrate import MIGRATIONS_DIR

        url, _ = schema_url
        apply_migrations(url, MIGRATIONS_DIR)

        with psycopg.connect(url) as conn:
            conn.execute("SELECT set_config('app.estudio_id', 'estudio-demo', true)")
            value = conn.execute("SELECT app_estudio_id()").fetchone()[0]

        assert value == "estudio-demo"
