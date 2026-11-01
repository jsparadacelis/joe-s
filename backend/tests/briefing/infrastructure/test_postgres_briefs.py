"""PostgresBriefs (RGB-32) on real Postgres, RLS included. No migration.

Names fixed here: PostgresBriefs(conn) with get_project(code, lock=False) -> BriefProject | None,
get_brief(project_id) -> dict, save_brief(project_id, brief) (replaces the `brief` key of the
phase 2 deliverable, creating the row if missing, never touching flags or other keys),
finalize(project_id, content) (replaces the content as a whole, complete and approved) and
get_frozen(project_id, phase).
"""

import threading
import time

import psycopg
import pytest
from psycopg.types.json import Jsonb

from backend.app.briefing.domain.ports import BriefProject
from backend.app.briefing.infrastructure.postgres_briefs import PostgresBriefs
from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
CODE = "PRY-2026-001"


def a_context(study_id=STUDY_A):
    return RequestContext(study_id=study_id, user_id="demo-user", role=Role.PROJECT_DIRECTOR)


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
            "(%s, %s, 'House (sample)', 2)",
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


def run(url, action, study_id=STUDY_A):
    with study_transaction(url, a_context(study_id)) as conn:
        return action(PostgresBriefs(conn))


class TestGetProject:
    def test_returns_id_code_and_phase(self, url):
        found = run(url, lambda b: b.get_project(CODE))

        assert found == BriefProject(project_id(url), CODE, 2)

    def test_unknown_code(self, url):
        assert run(url, lambda b: b.get_project("PRY-2026-999")) is None

    def test_another_study_does_not_see_it(self, url):
        assert run(url, lambda b: b.get_project(CODE), study_id=STUDY_B) is None

    def test_lock_serializes_concurrent_writers(self, url):
        order = []
        holding = threading.Event()

        def first():
            with study_transaction(url, a_context()) as conn:
                PostgresBriefs(conn).get_project(CODE, lock=True)
                holding.set()
                time.sleep(0.5)
                order.append("first commits")

        def second():
            holding.wait()
            with study_transaction(url, a_context()) as conn:
                PostgresBriefs(conn).get_project(CODE, lock=True)
                order.append("second locked")

        threads = [threading.Thread(target=first), threading.Thread(target=second)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        assert order == ["first commits", "second locked"]

    def test_a_plain_read_does_not_wait_for_the_lock(self, url):
        with study_transaction(url, a_context()) as conn:
            PostgresBriefs(conn).get_project(CODE, lock=True)
            result = []
            thread = threading.Thread(
                target=lambda: result.append(run(url, lambda b: b.get_project(CODE)))
            )
            thread.start()
            thread.join(timeout=3)

            assert not thread.is_alive()
        assert result[0] is not None


class TestBrief:
    def test_empty_when_there_is_no_deliverable_or_no_brief(self, url):
        assert run(url, lambda b: b.get_brief(project_id(url))) == {}
        seed(url, 2, {"other": 1})
        assert run(url, lambda b: b.get_brief(project_id(url))) == {}

    def test_save_creates_the_row_when_missing(self, url):
        run(url, lambda b: b.save_brief(project_id(url), {"needs": "x"}))

        assert rows(url) == [(2, {"brief": {"needs": "x"}}, False, False)]

    def test_save_replaces_the_brief_but_keeps_other_keys_and_flags(self, url):
        seed(url, 2, {"brief": {"needs": "old", "program": "old"}, "other": 1}, True, True)

        run(url, lambda b: b.save_brief(project_id(url), {"needs": "new"}))

        assert rows(url) == [(2, {"brief": {"needs": "new"}, "other": 1}, True, True)]

    def test_save_with_an_empty_brief_keeps_an_empty_object(self, url):
        seed(url, 2, {"brief": {"needs": "old"}})

        run(url, lambda b: b.save_brief(project_id(url), {}))

        assert run(url, lambda b: b.get_brief(project_id(url))) == {}

    def test_only_phase_2_is_touched(self, url):
        seed(url, 1, {"sponsor": "x"}, True, True)

        run(url, lambda b: b.save_brief(project_id(url), {"needs": "x"}))

        assert rows(url) == [
            (1, {"sponsor": "x"}, True, True),
            (2, {"brief": {"needs": "x"}}, False, False),
        ]

    def test_the_draft_is_read_back(self, url):
        run(url, lambda b: b.save_brief(project_id(url), {"needs": "Ñandú — ü"}))

        assert run(url, lambda b: b.get_brief(project_id(url))) == {"needs": "Ñandú — ü"}

    def test_another_study_can_neither_read_nor_write_it(self, url):
        seed(url, 2, {"brief": {"needs": "old"}})

        run(url, lambda b: b.save_brief(project_id(url), {"needs": "intruder"}), study_id=STUDY_B)

        assert run(url, lambda b: b.get_brief(project_id(url)), study_id=STUDY_B) == {}
        assert rows(url) == [(2, {"brief": {"needs": "old"}}, False, False)]

    def test_another_study_cannot_create_the_row(self, url):
        run(url, lambda b: b.save_brief(project_id(url), {"needs": "x"}), study_id=STUDY_B)

        assert rows(url) == []


class TestFinalize:
    def test_replaces_the_content_and_marks_complete_and_approved(self, url):
        seed(url, 2, {"brief": {"needs": "old"}})

        run(
            url,
            lambda b: b.finalize(project_id(url), {"brief": {}, "technical_data": {"data": []}}),
        )

        assert rows(url) == [(2, {"brief": {}, "technical_data": {"data": []}}, True, True)]

    def test_creates_the_row_when_there_is_none(self, url):
        run(url, lambda b: b.finalize(project_id(url), {"brief": {}}))

        assert rows(url) == [(2, {"brief": {}}, True, True)]

    def test_other_phases_are_not_touched(self, url):
        seed(url, 1, {"sheet": {}}, True, True)
        seed(url, 3, {"x": 1})

        run(url, lambda b: b.finalize(project_id(url), {"brief": {}}))

        assert rows(url) == [
            (1, {"sheet": {}}, True, True),
            (2, {"brief": {}}, True, True),
            (3, {"x": 1}, False, False),
        ]

    def test_another_study_cannot_finalize_it(self, url):
        seed(url, 2, {"brief": {"needs": "old"}})

        run(url, lambda b: b.finalize(project_id(url), {"brief": {}}), study_id=STUDY_B)

        assert rows(url) == [(2, {"brief": {"needs": "old"}}, False, False)]

    def test_a_rolled_back_transaction_finalizes_nothing(self, url):
        seed(url, 2, {"brief": {"needs": "old"}})

        with pytest.raises(RuntimeError):
            with study_transaction(url, a_context()) as conn:
                PostgresBriefs(conn).finalize(project_id(url), {"brief": {}})
                raise RuntimeError("boom")

        assert rows(url) == [(2, {"brief": {"needs": "old"}}, False, False)]


class TestGetFrozen:
    def test_returns_the_latest_version_of_the_phase(self, url):
        freeze(url, 2, 1, {"v": 1})
        freeze(url, 2, 2, {"v": 2})
        freeze(url, 1, 1, {"sheet": {}})

        assert run(url, lambda b: b.get_frozen(project_id(url), 2)) == {"v": 2}

    def test_none_when_nothing_is_frozen(self, url):
        assert run(url, lambda b: b.get_frozen(project_id(url), 2)) is None

    def test_another_study_sees_nothing(self, url):
        freeze(url, 2, 1, {"brief": {}})

        assert run(url, lambda b: b.get_frozen(project_id(url), 2), study_id=STUDY_B) is None
