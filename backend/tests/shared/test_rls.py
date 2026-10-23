"""Isolation between studies on real Postgres: study A cannot see or touch study B's data."""

import psycopg
import pytest

from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"


@pytest.fixture
def db(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO studies (id, name) VALUES (%s, 'Study A (sample)'), "
            "(%s, 'Study B (sample)')",
            (STUDY_A, STUDY_B),
        )
        admin.execute("CREATE TABLE note (id serial PRIMARY KEY, study_id uuid, body text)")
        admin.execute("SELECT protect_study_table('note')")
        admin.execute("GRANT USAGE ON SEQUENCE note_id_seq TO rgb_app")
        admin.execute(
            "INSERT INTO note (study_id, body) VALUES (%s, 'of A'), (%s, 'of B')",
            (STUDY_A, STUDY_B),
        )
    return url


def as_study(url, study_id):
    conn = psycopg.connect(url)
    conn.execute("SET LOCAL ROLE rgb_app")
    if study_id is not None:
        conn.execute("SELECT set_config('app.study_id', %s, true)", (study_id,))
    return conn


def texts(conn):
    return sorted(r[0] for r in conn.execute("SELECT body FROM note").fetchall())


class TestStudyIsolation:
    def test_study_only_reads_its_own_rows(self, db):
        with as_study(db, STUDY_A) as conn:
            visible = texts(conn)

        assert visible == ["of A"]

    def test_study_only_sees_its_own_study_row(self, db):
        with as_study(db, STUDY_A) as conn:
            rows = conn.execute("SELECT id::text FROM studies").fetchall()

        assert rows == [(STUDY_A,)]

    def test_cannot_insert_rows_for_another_study(self, db):
        with as_study(db, STUDY_A) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute(
                    "INSERT INTO note (study_id, body) VALUES (%s, 'intruder')", (STUDY_B,)
                )

    def test_cannot_move_own_row_to_another_study(self, db):
        with as_study(db, STUDY_A) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute("UPDATE note SET study_id = %s", (STUDY_B,))

    def test_update_and_delete_do_not_reach_other_study(self, db):
        with as_study(db, STUDY_A) as conn:
            updated = conn.execute("UPDATE note SET body = 'touched'").rowcount
            deleted = conn.execute("DELETE FROM note").rowcount
        with psycopg.connect(db) as admin:
            remaining = admin.execute("SELECT body FROM note").fetchall()

        assert (updated, deleted) == (1, 1)
        assert remaining == [("of B",)]

    def test_direct_query_filtering_by_other_study_returns_nothing(self, db):
        with as_study(db, STUDY_A) as conn:
            rows = conn.execute("SELECT body FROM note WHERE study_id = %s", (STUDY_B,)).fetchall()

        assert rows == []

    def test_without_a_study_nothing_is_visible_or_writable(self, db):
        with as_study(db, None) as conn:
            visible = texts(conn)
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute("INSERT INTO note (study_id, body) VALUES (%s, 'x')", (STUDY_A,))

        assert visible == []
