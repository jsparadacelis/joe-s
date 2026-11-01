"""Technical data on real Postgres: round trip, order, upsert, study isolation and RLS."""

from datetime import datetime, timezone

import psycopg
import pytest

from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role
from backend.app.technical_data.domain.catalog import CATALOG, Source
from backend.app.technical_data.domain.datum import TechnicalDatum
from backend.app.technical_data.infrastructure.postgres_technical_data import (
    PostgresTechnicalData,
)
from backend.app.technical_data.infrastructure.postgres_technical_projects import (
    PostgresTechnicalProjects,
)

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
PROJECT_A = "aaaaaaaa-0000-0000-0000-00000000000a"
PROJECT_A2 = "aaaaaaaa-0000-0000-0000-00000000000b"
PROJECT_B = "bbbbbbbb-0000-0000-0000-00000000000b"
REFERENCE = "9872023VH5797S0001WX"
WHEN = datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc)


def a_context(study_id):
    return RequestContext(study_id=study_id, user_id="demo-user", role=Role.PARTNER)


def queried(field_id, original, **overrides):
    values = {
        "field_id": field_id,
        "value": original,
        "source": Source.CATASTRO,
        "original": original,
        "verified": False,
    }
    values.update(overrides)
    return TechnicalDatum(**values)


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
            "(%s, %s, 'PRY-T-001', 'One (sample)', 2), (%s, %s, 'PRY-T-002', 'Two (sample)', 2), "
            "(%s, %s, 'PRY-T-001', 'Other (sample)', 2)",
            (PROJECT_A, STUDY_A, PROJECT_A2, STUDY_A, PROJECT_B, STUDY_B),
        )
    return url


def in_study(url, study_id, action):
    with study_transaction(url, a_context(study_id)) as conn:
        return action(PostgresTechnicalData(conn))


def admin_rows(url, sql, params=()):
    with psycopg.connect(url, autocommit=True) as admin:
        return admin.execute(sql, params).fetchall()


class TestData:
    def test_a_project_without_rows_reads_as_the_blank_catalog(self, url):
        sheet = in_study(url, STUDY_A, lambda d: d.load(PROJECT_A))

        assert [d.field_id for d in sheet.data] == [d.id for d in CATALOG]
        assert all(d.value == "" and d.original is None for d in sheet.data)

    def test_saved_data_are_read_back_equal_whatever_their_state(self, url):
        rows = [
            queried("builtArea", "142", value="138", verified=True),
            TechnicalDatum(field_id="maxHeight", value="10,5", source=Source.MANUAL),
            queried("use", "Residencial", verified=True),
        ]
        in_study(url, STUDY_A, lambda d: d.save(PROJECT_A, rows))

        sheet = in_study(url, STUDY_A, lambda d: d.load(PROJECT_A))

        for row in rows:
            assert sheet.get(row.field_id) == row
        assert sheet.get("year").value == ""

    def test_the_order_is_the_catalogs_whatever_the_order_of_insertion(self, url):
        in_study(
            url,
            STUDY_A,
            lambda d: d.save(
                PROJECT_A, [queried("calcArea", "Catastral"), queried("address", "X")]
            ),
        )

        sheet = in_study(url, STUDY_A, lambda d: d.load(PROJECT_A))

        assert [d.field_id for d in sheet.data] == [d.id for d in CATALOG]

    def test_saving_again_replaces_that_datum_and_leaves_the_others(self, url):
        in_study(
            url,
            STUDY_A,
            lambda d: d.save(PROJECT_A, [queried("year", "1958"), queried("use", "Industrial")]),
        )
        in_study(
            url, STUDY_A, lambda d: d.save(PROJECT_A, [queried("year", "1960", verified=True)])
        )

        sheet = in_study(url, STUDY_A, lambda d: d.load(PROJECT_A))

        assert sheet.get("year").value == "1960" and sheet.get("year").verified is True
        assert sheet.get("use").value == "Industrial"
        assert admin_rows(url, "SELECT count(*) FROM technical_data") == [(2,)]

    def test_saving_nothing_is_fine(self, url):
        in_study(url, STUDY_A, lambda d: d.save(PROJECT_A, []))

        assert admin_rows(url, "SELECT count(*) FROM technical_data") == [(0,)]

    def test_projects_do_not_share_data(self, url):
        in_study(url, STUDY_A, lambda d: d.save(PROJECT_A, [queried("year", "1958")]))

        assert in_study(url, STUDY_A, lambda d: d.load(PROJECT_A2)).get("year").value == ""

    def test_another_study_does_not_see_the_data(self, url):
        in_study(url, STUDY_A, lambda d: d.save(PROJECT_A, [queried("year", "1958")]))

        assert in_study(url, STUDY_B, lambda d: d.load(PROJECT_A)).get("year").value == ""
        assert in_study(url, STUDY_B, lambda d: d.load(PROJECT_B)).get("year").value == ""

    def test_a_project_of_another_study_cannot_be_referenced(self, url):
        with pytest.raises(psycopg.errors.ForeignKeyViolation):
            in_study(url, STUDY_B, lambda d: d.save(PROJECT_A, [queried("year", "1958")]))

        assert admin_rows(url, "SELECT count(*) FROM technical_data") == [(0,)]

    def test_a_row_for_another_study_cannot_be_written_directly(self, url):
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with study_transaction(url, a_context(STUDY_B)) as conn:
                conn.execute(
                    "INSERT INTO technical_data (study_id, project_id, field_id, value, source) "
                    "VALUES (%s, %s, 'year', '1958', 'catastro')",
                    (STUDY_A, PROJECT_A),
                )

    def test_the_composite_key_rejects_a_row_whose_study_is_not_the_projects(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            with pytest.raises(psycopg.errors.ForeignKeyViolation):
                admin.execute(
                    "INSERT INTO technical_data (study_id, project_id, field_id, value, source) "
                    "VALUES (%s, %s, 'year', '1958', 'catastro')",
                    (STUDY_B, PROJECT_A),
                )

    @pytest.mark.parametrize(
        ("value", "source"),
        [("", "catastro"), ("   ", "catastro"), ("x" * 201, "catastro"), ("1", "owner")],
    )
    def test_the_table_refuses_blank_long_or_unknown_source_values(self, url, value, source):
        with psycopg.connect(url, autocommit=True) as admin:
            with pytest.raises(psycopg.errors.CheckViolation):
                admin.execute(
                    "INSERT INTO technical_data (study_id, project_id, field_id, value, source) "
                    "VALUES (%s, %s, 'year', %s, %s)",
                    (STUDY_A, PROJECT_A, value, source),
                )

    def test_the_application_role_cannot_delete_data(self, url):
        in_study(url, STUDY_A, lambda d: d.save(PROJECT_A, [queried("year", "1958")]))

        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with study_transaction(url, a_context(STUDY_A)) as conn:
                conn.execute("DELETE FROM technical_data")

    def test_the_tables_are_protected_by_row_level_security(self, url):
        unprotected = [r[0] for r in admin_rows(url, "SELECT * FROM tables_without_rls()")]

        assert unprotected == []


class TestQueries:
    def test_there_is_no_query_before_the_first(self, url):
        assert in_study(url, STUDY_A, lambda d: d.last_query(PROJECT_A)) is None

    def test_the_last_query_is_read_back(self, url):
        in_study(url, STUDY_A, lambda d: d.record_query(PROJECT_A, REFERENCE, WHEN))

        record = in_study(url, STUDY_A, lambda d: d.last_query(PROJECT_A))

        assert (record.cadastral_reference, record.queried_at) == (REFERENCE, WHEN)

    def test_a_new_query_replaces_the_previous_one(self, url):
        in_study(url, STUDY_A, lambda d: d.record_query(PROJECT_A, REFERENCE, WHEN))
        later = datetime(2026, 12, 1, tzinfo=timezone.utc)
        in_study(url, STUDY_A, lambda d: d.record_query(PROJECT_A, "1234567VH1234S0001AA", later))

        record = in_study(url, STUDY_A, lambda d: d.last_query(PROJECT_A))

        assert (record.cadastral_reference, record.queried_at) == ("1234567VH1234S0001AA", later)
        assert admin_rows(url, "SELECT count(*) FROM technical_data_queries") == [(1,)]

    def test_each_project_keeps_its_own_query(self, url):
        in_study(url, STUDY_A, lambda d: d.record_query(PROJECT_A, REFERENCE, WHEN))

        assert in_study(url, STUDY_A, lambda d: d.last_query(PROJECT_A2)) is None

    def test_another_study_does_not_see_the_query(self, url):
        in_study(url, STUDY_A, lambda d: d.record_query(PROJECT_A, REFERENCE, WHEN))

        assert in_study(url, STUDY_B, lambda d: d.last_query(PROJECT_A)) is None

    def test_a_query_cannot_reference_a_project_of_another_study(self, url):
        with pytest.raises(psycopg.errors.ForeignKeyViolation):
            in_study(url, STUDY_B, lambda d: d.record_query(PROJECT_A, REFERENCE, WHEN))

    def test_the_reference_must_have_twenty_characters(self, url):
        with psycopg.connect(url, autocommit=True) as admin:
            with pytest.raises(psycopg.errors.CheckViolation):
                admin.execute(
                    "INSERT INTO technical_data_queries (study_id, project_id, cadastral_reference) "
                    "VALUES (%s, %s, 'SHORT')",
                    (STUDY_A, PROJECT_A),
                )


class TestProjects:
    def find(self, url, study_id, code, lock=False):
        with study_transaction(url, a_context(study_id)) as conn:
            return PostgresTechnicalProjects(conn).find(code, lock=lock)

    def test_finds_a_project_of_the_study_by_code(self, url):
        project = self.find(url, STUDY_A, "PRY-T-001")

        assert (project.id, project.code, project.phase) == (PROJECT_A, "PRY-T-001", 2)

    def test_the_same_code_in_another_study_is_another_project(self, url):
        assert self.find(url, STUDY_B, "PRY-T-001").id == PROJECT_B

    def test_an_unknown_code_is_none(self, url):
        assert self.find(url, STUDY_A, "PRY-T-999") is None

    def test_it_can_lock_the_project(self, url):
        assert self.find(url, STUDY_A, "PRY-T-001", lock=True).id == PROJECT_A
