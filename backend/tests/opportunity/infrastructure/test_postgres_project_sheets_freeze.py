"""finalize_content and get_frozen (RGB-19) on real Postgres, RLS included.

Names fixed here for the Developer:
- PostgresProjectSheets(conn).finalize_content(project_id, content): upserts the phase 1 exit
  deliverable REPLACING its content as a whole (no merge) and leaving it complete and approved.
  Other phases are never touched. No migration.
- PostgresProjectSheets(conn).get_frozen(project_id, phase) -> dict | None: the content of the
  latest frozen version of that phase of the project, None when there is none. RLS applies.
"""

import psycopg
import pytest
from psycopg.types.json import Jsonb

from backend.app.opportunity.infrastructure.postgres_project_sheets import PostgresProjectSheets
from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
CODE = "PRY-2026-001"


def a_context(study_id=STUDY_A):
    return RequestContext(study_id=study_id, user_id="demo-user", role=Role.PARTNER)


@pytest.fixture
def url(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO studies (id, name) VALUES (%s, 'A (sample)'), (%s, 'B (sample)')",
            (STUDY_A, STUDY_B),
        )
        admin.execute(
            "INSERT INTO projects (study_id, code, name, current_phase) VALUES "
            "(%s, %s, 'Warehouse (sample)', 1)",
            (STUDY_A, CODE),
        )
    return url


def project_id(url):
    with psycopg.connect(url, autocommit=True) as admin:
        return admin.execute("SELECT id::text FROM projects WHERE code = %s", (CODE,)).fetchone()[0]


def seed(url, phase, content, complete=False, approved=False):
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO exit_deliverables (study_id, project_id, phase, content, complete, "
            "approved) SELECT study_id, id, %s, %s, %s, %s FROM projects",
            (phase, Jsonb(content), complete, approved),
        )


def freeze(url, phase, version, content):
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO frozen_versions (study_id, project_id, phase, version, content, "
            "frozen_by) SELECT study_id, id, %s, %s, %s, 'demo-user' FROM projects",
            (phase, version, Jsonb(content)),
        )


def rows(url):
    with psycopg.connect(url, autocommit=True) as admin:
        return admin.execute(
            "SELECT phase, content, complete, approved FROM exit_deliverables ORDER BY phase"
        ).fetchall()


def finalize(url, content, study_id=STUDY_A):
    with study_transaction(url, a_context(study_id)) as conn:
        PostgresProjectSheets(conn).finalize_content(project_id(url), content)


def frozen(url, phase, study_id=STUDY_A):
    with study_transaction(url, a_context(study_id)) as conn:
        return PostgresProjectSheets(conn).get_frozen(project_id(url), phase)


class TestFinalizeContent:
    def test_replaces_the_content_and_marks_complete_and_approved(self, url):
        seed(url, 1, {"sponsor": "Old", "team": "Old team"})

        finalize(url, {"sponsor": "New", "sheet": {"code": CODE}})

        assert rows(url) == [(1, {"sponsor": "New", "sheet": {"code": CODE}}, True, True)]

    def test_creates_the_row_when_there_is_none(self, url):
        finalize(url, {"sheet": {"code": CODE}})

        assert rows(url) == [(1, {"sheet": {"code": CODE}}, True, True)]

    def test_other_phases_are_not_touched(self, url):
        seed(url, 0, {"plan": {"total": 65}}, complete=True, approved=True)
        seed(url, 2, {"brief": "x"})

        finalize(url, {"sheet": {}})

        assert rows(url) == [
            (0, {"plan": {"total": 65}}, True, True),
            (1, {"sheet": {}}, True, True),
            (2, {"brief": "x"}, False, False),
        ]

    def test_another_study_cannot_finalize_it(self, url):
        seed(url, 1, {"sponsor": "Old"})

        finalize(url, {"sponsor": "Intruder"}, study_id=STUDY_B)

        assert rows(url) == [(1, {"sponsor": "Old"}, False, False)]

    def test_another_study_cannot_create_the_row(self, url):
        finalize(url, {"sheet": {}}, study_id=STUDY_B)

        assert rows(url) == []

    def test_a_rolled_back_transaction_finalizes_nothing(self, url):
        seed(url, 1, {"sponsor": "Old"})

        with pytest.raises(RuntimeError):
            with study_transaction(url, a_context()) as conn:
                PostgresProjectSheets(conn).finalize_content(project_id(url), {"sheet": {}})
                raise RuntimeError("boom")

        assert rows(url) == [(1, {"sponsor": "Old"}, False, False)]

    def test_the_result_can_be_read_back_in_the_same_transaction(self, url):
        with study_transaction(url, a_context()) as conn:
            sheets = PostgresProjectSheets(conn)
            sheets.finalize_content(project_id(url), {"sheet": {"code": CODE}})
            content = sheets.get_content(project_id(url))

        assert content == {"sheet": {"code": CODE}}


class TestGetFrozen:
    def test_returns_the_content_of_the_frozen_version(self, url):
        freeze(url, 1, 1, {"sheet": {"code": CODE}})

        assert frozen(url, 1) == {"sheet": {"code": CODE}}

    def test_none_when_nothing_is_frozen(self, url):
        assert frozen(url, 1) is None

    def test_only_the_asked_phase(self, url):
        freeze(url, 0, 1, {"plan": {}})

        assert frozen(url, 1) is None
        assert frozen(url, 0) == {"plan": {}}

    def test_the_latest_version_wins(self, url):
        freeze(url, 1, 1, {"v": 1})
        freeze(url, 1, 2, {"v": 2})

        assert frozen(url, 1) == {"v": 2}

    def test_another_study_sees_nothing(self, url):
        freeze(url, 1, 1, {"sheet": {}})

        assert frozen(url, 1, study_id=STUDY_B) is None

    def test_it_is_read_only(self, url):
        freeze(url, 1, 1, {"sheet": {}})

        frozen(url, 1)

        with psycopg.connect(url, autocommit=True) as admin:
            assert admin.execute("SELECT count(*) FROM frozen_versions").fetchone() == (1,)
