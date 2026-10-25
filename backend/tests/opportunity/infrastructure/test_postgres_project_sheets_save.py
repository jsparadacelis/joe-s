"""Saving the sheet content (RGB-17b) on real Postgres, RLS included.

Names fixed here for the Developer:
- PostgresProjectSheets(conn).save_content(project_id, content): upserts the phase 1 exit
  deliverable of the project. Keys in `content` replace the same keys; the others are kept; a
  key whose value is None is removed. A new row is created incomplete and unapproved; an
  existing row keeps `complete` and `approved`. Other phases are never touched. No migration.
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
        admin.execute(
            "INSERT INTO opportunities (study_id, project_id, client, location, project_type) "
            "SELECT study_id, id, 'Client (sample)', 'Town (sample)', 'industrial' FROM projects"
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


def rows(url):
    with psycopg.connect(url, autocommit=True) as admin:
        return admin.execute(
            "SELECT phase, content, complete, approved FROM exit_deliverables ORDER BY phase"
        ).fetchall()


def save(url, content, study_id=STUDY_A):
    with study_transaction(url, a_context(study_id)) as conn:
        PostgresProjectSheets(conn).save_content(project_id(url), content)


def test_creates_the_phase_1_row_when_there_is_none(url):
    save(url, {"sponsor": "Sponsor (sample)"})

    assert rows(url) == [(1, {"sponsor": "Sponsor (sample)"}, False, False)]


def test_merges_over_the_existing_content_without_touching_other_keys(url):
    plan = {"project_type": "facility", "scale": "small", "weeks": [1] * 7, "total": 7}
    seed(url, 1, {"sponsor": "Old", "team": "Team (sample)", "plan": plan})

    save(url, {"sponsor": "New", "contact": "Contact (sample)"})

    ((phase, content, _, _),) = rows(url)
    assert phase == 1
    assert content == {
        "sponsor": "New",
        "team": "Team (sample)",
        "contact": "Contact (sample)",
        "plan": plan,
    }


def test_a_new_plan_replaces_the_old_one_as_a_whole(url):
    seed(url, 1, {"plan": {"project_type": "facility", "scale": "small", "weeks": [1] * 7}})
    new = {"project_type": "industrial", "scale": "large", "weeks": [2] * 7, "total": 14}

    save(url, {"plan": new})

    assert rows(url)[0][1] == {"plan": new}


def test_none_removes_the_key(url):
    seed(url, 1, {"sponsor": "Old", "team": "Team (sample)"})

    save(url, {"sponsor": None, "never_set": None})

    assert rows(url)[0][1] == {"team": "Team (sample)"}


def test_the_result_can_be_read_back_in_the_same_transaction(url):
    with study_transaction(url, a_context()) as conn:
        sheets = PostgresProjectSheets(conn)
        sheets.save_content(project_id(url), {"sponsor": "Sponsor (sample)"})
        content = sheets.get_content(project_id(url))

    assert content == {"sponsor": "Sponsor (sample)"}


def test_an_existing_row_keeps_complete_and_approved(url):
    seed(url, 1, {"sponsor": "Old"}, complete=True, approved=True)

    save(url, {"sponsor": "New"})

    assert rows(url) == [(1, {"sponsor": "New"}, True, True)]


def test_updated_at_moves_forward(url):
    seed(url, 1, {"sponsor": "Old"})
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute("UPDATE exit_deliverables SET updated_at = now() - interval '1 day'")

    save(url, {"sponsor": "New"})

    with psycopg.connect(url, autocommit=True) as admin:
        assert admin.execute(
            "SELECT updated_at > now() - interval '1 hour' FROM exit_deliverables"
        ).fetchone() == (True,)


def test_other_phases_are_not_touched(url):
    seed(url, 0, {"plan": {"total": 65}}, complete=True, approved=True)

    save(url, {"sponsor": "Sponsor (sample)"})

    assert rows(url) == [
        (0, {"plan": {"total": 65}}, True, True),
        (1, {"sponsor": "Sponsor (sample)"}, False, False),
    ]


def test_another_study_cannot_write_the_content(url):
    seed(url, 1, {"sponsor": "Old"})

    save(url, {"sponsor": "Intruder"}, study_id=STUDY_B)

    assert rows(url) == [(1, {"sponsor": "Old"}, False, False)]


def test_another_study_cannot_create_the_row(url):
    save(url, {"sponsor": "Intruder"}, study_id=STUDY_B)

    assert rows(url) == []


def test_a_rolled_back_transaction_saves_nothing(url):
    seed(url, 1, {"sponsor": "Old"})

    with pytest.raises(RuntimeError):
        with study_transaction(url, a_context()) as conn:
            PostgresProjectSheets(conn).save_content(project_id(url), {"sponsor": "New"})
            raise RuntimeError("boom")

    assert rows(url) == [(1, {"sponsor": "Old"}, False, False)]
