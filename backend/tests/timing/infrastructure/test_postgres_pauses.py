"""Pauses on real Postgres: schema constraints, RLS, audit, rollback and concurrency."""

from datetime import date, datetime, timezone
from threading import Barrier, Thread

import psycopg
import pytest

from backend.app.access.infrastructure.dev_project_roles import DevProjectRoles
from backend.app.audit.infrastructure.postgres_audit_log import PostgresAuditLog
from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role
from backend.app.timing.application.pause_service import PauseService
from backend.app.timing.domain.errors import AlreadyPaused, NotAllowed
from backend.app.timing.domain.time_tracking import PauseReason
from backend.app.timing.infrastructure.postgres_pauses import PostgresPauses

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
PROJECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
PROJECT_A2 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2"
PROJECT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
CODE = "PRY-2026-001"
NOW = datetime(2026, 10, 24, 15, 0, tzinfo=timezone.utc)
VALID = {"reason": "client_wait", "expected_resumption": "2026-11-09"}


def a_context(study_id=STUDY_A, role=Role.PROJECT_DIRECTOR):
    return RequestContext(study_id=study_id, user_id="demo-user", role=role)


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
            "INSERT INTO projects (id, study_id, code, name, current_phase) VALUES "
            "(%s, %s, %s, 'House (sample)', 1), "
            "(%s, %s, 'PRY-2026-002', 'Second (sample)', 2), "
            "(%s, %s, %s, 'Other studio (sample)', 1)",
            (PROJECT_A, STUDY_A, CODE, PROJECT_A2, STUDY_A, PROJECT_B, STUDY_B, CODE),
        )
    return url


def run(url, action, *args, context=None, clock=lambda: NOW):
    context = context or a_context()
    with study_transaction(url, context) as conn:
        service = PauseService(
            PostgresPauses(conn), PostgresAuditLog(conn), DevProjectRoles(context), clock=clock
        )
        return getattr(service, action)(*((context,) if action != "history" else ()), *args)


def query(url, sql, *params):
    with psycopg.connect(url) as admin:
        return admin.execute(sql, params).fetchall()


class TestPauseAndResume:
    def test_pause_writes_the_row_the_flag_and_the_audit_in_one_go(self, url):
        result = run(url, "pause", CODE, VALID)

        assert result.error is None
        assert result.view.pause.id
        assert query(
            url,
            "SELECT phase, reason, started_on, expected_resumption, resumed_on, opened_by, "
            "closed_by FROM pauses",
        ) == [(1, "client_wait", date(2026, 10, 24), date(2026, 11, 9), None, "demo-user", None)]
        assert query(url, "SELECT paused FROM projects WHERE id = %s", PROJECT_A) == [(True,)]
        assert query(url, "SELECT action, outcome, entity_id, user_id FROM audit_events") == [
            ("pause_project", "ok", CODE, "demo-user")
        ]

    def test_resume_closes_the_row_clears_the_flag_and_audits(self, url):
        run(url, "pause", CODE, VALID)

        result = run(url, "resume", CODE, clock=lambda: datetime(2026, 11, 1, tzinfo=timezone.utc))

        assert result.error is None
        assert result.view.pause.resumed_on == date(2026, 11, 1)
        assert query(url, "SELECT resumed_on, closed_by FROM pauses") == [
            (date(2026, 11, 1), "demo-user")
        ]
        assert query(url, "SELECT paused FROM projects WHERE id = %s", PROJECT_A) == [(False,)]
        assert query(url, "SELECT action FROM audit_events ORDER BY id") == [
            ("pause_project",),
            ("resume_project",),
        ]

    def test_a_project_can_be_paused_again_after_resuming(self, url):
        run(url, "pause", CODE, VALID)
        run(url, "resume", CODE)

        result = run(url, "pause", CODE, VALID)

        assert result.error is None
        assert query(url, "SELECT count(*) FROM pauses") == [(2,)]

    def test_a_second_open_pause_is_a_409_style_rejection(self, url):
        run(url, "pause", CODE, VALID)

        result = run(url, "pause", CODE, VALID)

        assert isinstance(result.error, AlreadyPaused)
        assert query(url, "SELECT count(*) FROM pauses") == [(1,)]

    def test_a_refused_role_is_audited_and_commits_nothing_else(self, url):
        result = run(url, "pause", CODE, VALID, context=a_context(role=Role.ARCHITECT))

        assert isinstance(result.error, NotAllowed)
        assert query(url, "SELECT count(*) FROM pauses") == [(0,)]
        assert query(url, "SELECT paused FROM projects WHERE id = %s", PROJECT_A) == [(False,)]
        assert query(url, "SELECT action, outcome FROM audit_events") == [
            ("pause_project", "rejected")
        ]

    def test_history_lists_the_active_pause_and_the_closed_ones_newest_first(self, url):
        run(url, "pause", CODE, VALID, clock=lambda: datetime(2026, 9, 1, tzinfo=timezone.utc))
        run(url, "resume", CODE, clock=lambda: datetime(2026, 9, 10, tzinfo=timezone.utc))
        run(url, "pause", CODE, VALID, clock=lambda: datetime(2026, 10, 1, tzinfo=timezone.utc))
        run(url, "resume", CODE, clock=lambda: datetime(2026, 10, 5, tzinfo=timezone.utc))
        run(url, "pause", CODE, VALID)

        history = run(url, "history", CODE)

        assert history.active.pause.started_on == date(2026, 10, 24)
        assert [v.pause.started_on for v in history.history] == [
            date(2026, 10, 1),
            date(2026, 9, 1),
        ]
        assert history.history[0].pause.reason is PauseReason.CLIENT_WAIT

    def test_a_failure_after_the_writes_rolls_everything_back(self, url):
        class Boom(Exception):
            pass

        with pytest.raises(Boom):
            with study_transaction(url, a_context()) as conn:
                service = PauseService(
                    PostgresPauses(conn),
                    PostgresAuditLog(conn),
                    DevProjectRoles(a_context()),
                    clock=lambda: NOW,
                )
                service.pause(a_context(), CODE, VALID)
                raise Boom

        assert query(url, "SELECT count(*) FROM pauses") == [(0,)]
        assert query(url, "SELECT paused FROM projects WHERE id = %s", PROJECT_A) == [(False,)]
        assert query(url, "SELECT count(*) FROM audit_events") == [(0,)]


class TestIsolation:
    def test_study_b_cannot_see_or_pause_a_project_of_study_a(self, url):
        run(url, "pause", CODE, VALID)

        with study_transaction(url, a_context(STUDY_B)) as conn:
            repo = PostgresPauses(conn)
            project = repo.get_project(CODE)
            visible = repo.list_pauses(PROJECT_A)

        assert project.id == PROJECT_B  # same code, its own project
        assert visible == []

    def test_the_same_code_in_two_studios_pauses_independently(self, url):
        run(url, "pause", CODE, VALID)

        result = run(url, "pause", CODE, VALID, context=a_context(STUDY_B))

        assert result.error is None
        assert query(url, "SELECT count(*) FROM pauses") == [(2,)]

    def test_a_studio_cannot_insert_a_pause_for_another_studios_project(self, url):
        with pytest.raises(psycopg.Error):
            with study_transaction(url, a_context(STUDY_B)) as conn:
                conn.execute(
                    "INSERT INTO pauses (study_id, project_id, phase, reason, started_on, "
                    "expected_resumption, opened_by) VALUES (%s, %s, 1, 'other', "
                    "'2026-10-24', '2026-11-01', 'x')",
                    (STUDY_B, PROJECT_A),
                )


def insert_pause(conn, project=PROJECT_A, study=STUDY_A, **overrides):
    values = {
        "phase": 1,
        "reason": "other",
        "started_on": "2026-10-24",
        "expected_resumption": "2026-11-01",
        "resumed_on": None,
    }
    values.update(overrides)
    conn.execute(
        "INSERT INTO pauses (study_id, project_id, phase, reason, started_on, "
        "expected_resumption, resumed_on, opened_by, closed_by) "
        "VALUES (%(study)s, %(project)s, %(phase)s, %(reason)s, %(started_on)s, "
        "%(expected_resumption)s, %(resumed_on)s, 'x', %(closed_by)s)",
        {
            "study": study,
            "project": project,
            "closed_by": "x" if values["resumed_on"] else None,
            **values,
        },
    )


class TestSchema:
    def test_a_second_open_pause_for_the_same_project_violates_the_partial_index(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            insert_pause(admin)
            with pytest.raises(psycopg.errors.UniqueViolation):
                insert_pause(admin)

    def test_closed_pauses_do_not_count_for_the_unique_index(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            insert_pause(admin, resumed_on="2026-10-25")
            insert_pause(admin, resumed_on="2026-10-26")
            insert_pause(admin)

        assert query(url, "SELECT count(*) FROM pauses") == [(3,)]

    def test_two_projects_can_each_have_an_open_pause(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            insert_pause(admin)
            insert_pause(admin, project=PROJECT_A2)

    def test_concurrent_open_pauses_leave_exactly_one(self, url):
        barrier = Barrier(2)
        outcomes = []

        def attempt():
            with psycopg.connect(url, autocommit=True) as conn:
                barrier.wait()
                try:
                    insert_pause(conn)
                    outcomes.append("ok")
                except psycopg.errors.UniqueViolation:
                    outcomes.append("duplicate")

        threads = [Thread(target=attempt) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        assert sorted(outcomes) == ["duplicate", "ok"]

    def test_concurrent_pause_use_cases_leave_exactly_one_open_pause(self, url):
        barrier = Barrier(2)
        results = []

        def attempt():
            context = a_context()
            with study_transaction(url, context) as conn:
                barrier.wait()
                service = PauseService(
                    PostgresPauses(conn),
                    PostgresAuditLog(conn),
                    DevProjectRoles(a_context()),
                    clock=lambda: NOW,
                )
                results.append(service.pause(context, CODE, VALID))

        threads = [Thread(target=attempt) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        assert sorted(type(r.error).__name__ for r in results) == ["AlreadyPaused", "NoneType"]
        assert query(url, "SELECT count(*) FROM pauses WHERE resumed_on IS NULL") == [(1,)]

    def test_the_reason_is_restricted(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            with pytest.raises(psycopg.errors.CheckViolation):
                insert_pause(admin, reason="vacation")

    def test_the_expected_date_cannot_precede_the_start(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            with pytest.raises(psycopg.errors.CheckViolation):
                insert_pause(admin, expected_resumption="2026-10-23")

    def test_the_resumption_cannot_precede_the_start(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            with pytest.raises(psycopg.errors.CheckViolation):
                insert_pause(admin, resumed_on="2026-10-23")

    def test_the_phase_must_be_a_planned_one(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            with pytest.raises(psycopg.errors.CheckViolation):
                insert_pause(admin, phase=0)

    def test_the_project_must_belong_to_the_same_study(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            with pytest.raises(psycopg.errors.ForeignKeyViolation):
                insert_pause(admin, study=STUDY_B, project=PROJECT_A)

    def test_the_table_has_forced_rls_and_a_policy(self, url):
        assert query(url, "SELECT * FROM tables_without_rls()") == []
