"""create_opportunity on real Postgres: RLS, audit, codes, atomicity."""

import threading
from datetime import datetime, timezone

import psycopg
import pytest

from backend.app.audit.infrastructure.postgres_audit_log import PostgresAuditLog
from backend.app.opportunity.application.create_opportunity import CreateOpportunity
from backend.app.opportunity.domain.errors import OpportunityError
from backend.app.opportunity.infrastructure.postgres_opportunity import PostgresOpportunities
from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
NOW = datetime(2026, 10, 24, 12, 0, tzinfo=timezone.utc)


def a_context(study_id=STUDY_A):
    return RequestContext(study_id=study_id, user_id="demo-user", role=Role.PARTNER)


def valid_input(**overrides):
    data = {
        "name": "Warehouse (sample)",
        "client": "Client (sample)",
        "location": "Town (sample)",
        "project_type": "industrial",
        "owner": "Owner (sample)",
        "estimated_budget": 125000.5,
        "deadline": "2026-12-31",
    }
    data.update(overrides)
    return data


@pytest.fixture
def url(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO studies (id, name) VALUES (%s, 'A (sample)'), (%s, 'B (sample)')",
            (STUDY_A, STUDY_B),
        )
    return url


def create(url, data=None, study_id=STUDY_A, clock=lambda: NOW, audit_class=PostgresAuditLog):
    context = a_context(study_id)
    with study_transaction(url, context) as conn:
        use_case = CreateOpportunity(PostgresOpportunities(conn), audit_class(conn), clock=clock)
        return use_case.execute(context, data or valid_input())


def admin_rows(url, sql, params=()):
    with psycopg.connect(url, autocommit=True) as admin:
        return admin.execute(sql, params).fetchall()


class TestCreate:
    def test_creates_the_project_in_phase_zero_and_the_opportunity(self, url):
        created = create(url)

        assert created.code == "PRY-2026-001"
        project = admin_rows(
            url,
            "SELECT code, name, current_phase, active, paused, traffic_light, next_milestone, "
            "responsible_id FROM projects",
        )
        assert project == [
            ("PRY-2026-001", "Warehouse (sample)", 0, False, False, None, None, "Owner (sample)")
        ]
        opportunity = admin_rows(
            url,
            "SELECT o.client, o.location, o.project_type, o.estimated_budget, o.deadline, "
            "o.source, o.decision_date, o.study_id::text FROM opportunities o "
            "JOIN projects p ON p.id = o.project_id",
        )
        assert opportunity[0][:3] == ("Client (sample)", "Town (sample)", "industrial")
        assert str(opportunity[0][3]) == "125000.50"
        assert str(opportunity[0][4]) == "2026-12-31"
        assert opportunity[0][5:7] == (None, None)
        assert opportunity[0][7] == STUDY_A

    def test_writes_an_audit_event_in_the_same_transaction(self, url):
        create(url)

        events = admin_rows(
            url,
            "SELECT study_id::text, user_id, entity, entity_id, action, outcome, "
            "new_value->>'name', created_at IS NOT NULL FROM audit_events",
        )
        assert events == [
            (
                STUDY_A,
                "demo-user",
                "project",
                "PRY-2026-001",
                "create_opportunity",
                "ok",
                "Warehouse (sample)",
                True,
            )
        ]

    def test_nothing_is_stored_if_the_audit_fails(self, url):
        class BrokenAudit:
            def __init__(self, conn):
                pass

            def record(self, event):
                raise RuntimeError("audit down")

        with pytest.raises(RuntimeError):
            create(url, audit_class=BrokenAudit)

        assert admin_rows(url, "SELECT count(*) FROM projects") == [(0,)]
        assert admin_rows(url, "SELECT count(*) FROM opportunities") == [(0,)]

    def test_invalid_input_stores_nothing(self, url):
        with pytest.raises(OpportunityError):
            create(url, valid_input(client=""))

        assert admin_rows(url, "SELECT count(*) FROM projects") == [(0,)]
        assert admin_rows(url, "SELECT count(*) FROM audit_events") == [(0,)]


class TestCodes:
    def test_codes_are_sequential_per_study_and_year(self, url):
        codes = [create(url).code for _ in range(3)]

        assert codes == ["PRY-2026-001", "PRY-2026-002", "PRY-2026-003"]

    def test_the_sequence_restarts_each_year(self, url):
        create(url)
        next_year = create(url, clock=lambda: datetime(2027, 1, 1, tzinfo=timezone.utc))

        assert next_year.code == "PRY-2027-001"

    def test_each_study_has_its_own_sequence(self, url):
        create(url)
        other = create(url, study_id=STUDY_B)

        assert other.code == "PRY-2026-001"

    def test_the_number_continues_after_the_highest_existing_code(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute(
                "INSERT INTO projects (study_id, code, name, current_phase) "
                "VALUES (%s, 'PRY-2026-009', 'Imported (sample)', 2), "
                "(%s, 'PRY-EJ-050', 'Other format (sample)', 1)",
                (STUDY_A, STUDY_A),
            )

        assert create(url).code == "PRY-2026-010"

    def test_numbers_beyond_999_keep_growing(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute(
                "INSERT INTO projects (study_id, code, name, current_phase) "
                "VALUES (%s, 'PRY-2026-999', 'Imported (sample)', 2)",
                (STUDY_A,),
            )

        assert create(url).code == "PRY-2026-1000"

    def test_concurrent_creations_never_repeat_a_code(self, url):
        results, errors = [], []

        def worker():
            try:
                results.append(create(url).code)
            except Exception as error:  # noqa: BLE001 - reported in the assertion below
                errors.append(error)

        threads = [threading.Thread(target=worker) for _ in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        assert errors == []
        assert sorted(results) == [f"PRY-2026-{n:03d}" for n in range(1, 9)]


class TestRls:
    def test_another_study_neither_sees_nor_lists_the_opportunity(self, url):
        create(url)

        with study_transaction(url, a_context(STUDY_B)) as conn:
            assert conn.execute("SELECT count(*) FROM opportunities").fetchone() == (0,)
            assert conn.execute("SELECT count(*) FROM projects").fetchone() == (0,)
            assert PostgresOpportunities(conn).next_code(2026) == "PRY-2026-001"

        with study_transaction(url, a_context(STUDY_A)) as conn:
            assert conn.execute("SELECT count(*) FROM opportunities").fetchone() == (1,)

    def test_the_app_role_cannot_insert_into_another_study(self, url):
        create(url)
        project_id = admin_rows(url, "SELECT id::text FROM projects")[0][0]

        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with study_transaction(url, a_context(STUDY_B)) as conn:
                conn.execute(
                    "INSERT INTO opportunities (study_id, project_id, client, location, "
                    "project_type) VALUES (%s, %s, 'c', 'l', 'industrial')",
                    (STUDY_A, project_id),
                )

    def test_the_table_is_protected_by_forced_rls(self, url):
        assert admin_rows(url, "SELECT * FROM tables_without_rls()") == []


class TestSchemaConstraints:
    def _insert(self, url, **overrides):
        project_id = admin_rows(url, "SELECT id::text FROM projects")[0][0]
        values = {"project_type": "industrial", "estimated_budget": None, **overrides}
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute(
                "INSERT INTO opportunities (study_id, project_id, client, location, "
                "project_type, estimated_budget) VALUES (%s, %s, 'c', 'l', %s, %s)",
                (STUDY_A, project_id, values["project_type"], values["estimated_budget"]),
            )

    def test_unknown_project_type_is_rejected(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute(
                "INSERT INTO projects (study_id, code, name, current_phase) "
                "VALUES (%s, 'PRY-2026-001', 'x (sample)', 0)",
                (STUDY_A,),
            )

        with pytest.raises(psycopg.errors.CheckViolation):
            self._insert(url, project_type="castle")

    def test_negative_budget_is_rejected(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute(
                "INSERT INTO projects (study_id, code, name, current_phase) "
                "VALUES (%s, 'PRY-2026-001', 'x (sample)', 0)",
                (STUDY_A,),
            )

        with pytest.raises(psycopg.errors.CheckViolation):
            self._insert(url, estimated_budget=-1)

    def test_a_project_has_at_most_one_opportunity(self, url):
        create(url)

        with pytest.raises(psycopg.errors.UniqueViolation):
            self._insert(url)

    def test_the_opportunity_must_belong_to_a_project_of_the_same_study(self, url):
        # A project without an opportunity, so only the composite foreign key can object.
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute(
                "INSERT INTO projects (study_id, code, name, current_phase) "
                "VALUES (%s, 'PRY-2026-001', 'x (sample)', 0)",
                (STUDY_A,),
            )
        project_id = admin_rows(url, "SELECT id::text FROM projects")[0][0]

        with pytest.raises(psycopg.errors.ForeignKeyViolation):
            with psycopg.connect(url, autocommit=True) as admin:
                admin.execute(
                    "INSERT INTO opportunities (study_id, project_id, client, location, "
                    "project_type) VALUES (%s, %s, 'c', 'l', 'industrial')",
                    (STUDY_B, project_id),
                )
