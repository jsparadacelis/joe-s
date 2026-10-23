"""Aislamiento entre estudios con Postgres real: el estudio A no ve ni toca lo del B."""

import psycopg
import pytest

from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations

pytestmark = pytest.mark.integration

ESTUDIO_A = "11111111-1111-1111-1111-111111111111"
ESTUDIO_B = "22222222-2222-2222-2222-222222222222"


@pytest.fixture
def db(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO estudios (id, nombre) VALUES (%s, 'Estudio A (ejemplo)'), "
            "(%s, 'Estudio B (ejemplo)')",
            (ESTUDIO_A, ESTUDIO_B),
        )
        admin.execute("CREATE TABLE nota (id serial PRIMARY KEY, estudio_id uuid, texto text)")
        admin.execute("SELECT proteger_tabla_de_estudio('nota')")
        admin.execute("GRANT USAGE ON SEQUENCE nota_id_seq TO rgb_app")
        admin.execute(
            "INSERT INTO nota (estudio_id, texto) VALUES (%s, 'de A'), (%s, 'de B')",
            (ESTUDIO_A, ESTUDIO_B),
        )
    return url


def as_study(url, estudio_id):
    conn = psycopg.connect(url)
    conn.execute("SET LOCAL ROLE rgb_app")
    if estudio_id is not None:
        conn.execute("SELECT set_config('app.estudio_id', %s, true)", (estudio_id,))
    return conn


def texts(conn):
    return sorted(r[0] for r in conn.execute("SELECT texto FROM nota").fetchall())


class TestAislamientoEntreEstudios:
    def test_study_only_reads_its_own_rows(self, db):
        with as_study(db, ESTUDIO_A) as conn:
            visible = texts(conn)

        assert visible == ["de A"]

    def test_study_only_sees_its_own_study_row(self, db):
        with as_study(db, ESTUDIO_A) as conn:
            rows = conn.execute("SELECT id::text FROM estudios").fetchall()

        assert rows == [(ESTUDIO_A,)]

    def test_cannot_insert_rows_for_another_study(self, db):
        with as_study(db, ESTUDIO_A) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute(
                    "INSERT INTO nota (estudio_id, texto) VALUES (%s, 'intruso')", (ESTUDIO_B,)
                )

    def test_cannot_move_own_row_to_another_study(self, db):
        with as_study(db, ESTUDIO_A) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute("UPDATE nota SET estudio_id = %s", (ESTUDIO_B,))

    def test_update_and_delete_do_not_reach_other_study(self, db):
        with as_study(db, ESTUDIO_A) as conn:
            updated = conn.execute("UPDATE nota SET texto = 'tocado'").rowcount
            deleted = conn.execute("DELETE FROM nota").rowcount
        with psycopg.connect(db) as admin:
            remaining = admin.execute("SELECT texto FROM nota").fetchall()

        assert (updated, deleted) == (1, 1)
        assert remaining == [("de B",)]

    def test_direct_query_filtering_by_other_study_returns_nothing(self, db):
        with as_study(db, ESTUDIO_A) as conn:
            rows = conn.execute(
                "SELECT texto FROM nota WHERE estudio_id = %s", (ESTUDIO_B,)
            ).fetchall()

        assert rows == []

    def test_without_a_study_nothing_is_visible_or_writable(self, db):
        with as_study(db, None) as conn:
            visible = texts(conn)
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute("INSERT INTO nota (estudio_id, texto) VALUES (%s, 'x')", (ESTUDIO_A,))

        assert visible == []
