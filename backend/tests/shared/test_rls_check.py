"""`tablas_sin_rls()` es la comprobación de CI: avisa de tablas sin RLS forzada o sin política."""

import psycopg
import pytest

from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations

pytestmark = pytest.mark.integration


@pytest.fixture
def url(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    return url


def unprotected(url):
    with psycopg.connect(url) as conn:
        return sorted(r[0] for r in conn.execute("SELECT * FROM tablas_sin_rls()").fetchall())


def test_real_migrations_leave_no_unprotected_table(url):
    assert unprotected(url) == []


def test_table_without_rls_is_reported(url):
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute("CREATE TABLE suelta (id int, estudio_id uuid)")

    assert unprotected(url) == ["suelta"]


def test_rls_enabled_but_without_policy_is_reported(url):
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute("CREATE TABLE a_medias (id int, estudio_id uuid)")
        conn.execute("ALTER TABLE a_medias ENABLE ROW LEVEL SECURITY")
        conn.execute("ALTER TABLE a_medias FORCE ROW LEVEL SECURITY")

    assert unprotected(url) == ["a_medias"]


def test_table_protected_with_the_template_is_not_reported(url):
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute("CREATE TABLE ok (id int, estudio_id uuid)")
        conn.execute("SELECT proteger_tabla_de_estudio('ok')")

    assert unprotected(url) == []
