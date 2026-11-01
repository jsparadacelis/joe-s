"""The per-study relief cache on real Postgres: isolation, expiry, upsert, constraints."""

from datetime import datetime, timedelta, timezone

import psycopg
import pytest

from backend.app.external_data.domain.relief import (
    ElevationGrid,
    Relief,
    ReliefOptions,
    plan_relief_window,
)
from backend.app.external_data.infrastructure.postgres_relief_cache import PostgresReliefCache
from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role
from backend.tests.external_data.domain.test_plot import REFERENCE, TRIANGLE, _plot_from_metres

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
NOW = datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc)
MAX_AGE = timedelta(days=30)
OPTIONS = ReliefOptions(25, 300)


def a_relief(base=10.0, options=OPTIONS, nodata=False):
    plot = _plot_from_metres(TRIANGLE)
    plan = plan_relief_window(plot, options)
    cols, rows = plan.window.grid_size
    values = [base + i * 0.5 for i in range(cols * rows)]
    if nodata:
        values[0] = None
    return Relief(
        REFERENCE,
        plan.window,
        ElevationGrid(cols, rows, tuple(values)),
        plan.outline,
        plan.clipped,
        plan.parcel_clipped,
        plot.computed_area_m2,
    )


def a_context(study_id):
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
    return url


def in_study(url, study_id, action, now=NOW):
    with study_transaction(url, a_context(study_id)) as conn:
        return action(PostgresReliefCache(conn, clock=lambda: now))


def admin_rows(url, sql, params=()):
    with psycopg.connect(url, autocommit=True) as admin:
        return admin.execute(sql, params).fetchall()


def get(cache, options=OPTIONS):
    return cache.get(REFERENCE, options, MAX_AGE)


def test_a_stored_relief_is_read_back_equal(url):
    relief = a_relief()
    in_study(url, STUDY_A, lambda c: c.put(relief, OPTIONS, NOW))

    assert in_study(url, STUDY_A, get) == relief


def test_cells_without_data_survive_the_round_trip(url):
    relief = a_relief(nodata=True)
    in_study(url, STUDY_A, lambda c: c.put(relief, OPTIONS, NOW))

    stored = in_study(url, STUDY_A, get)

    assert stored.grid.values[0] is None
    assert stored == relief


def test_an_unknown_reference_is_absent(url):
    assert in_study(url, STUDY_A, get) is None


def test_other_options_are_other_entries(url):
    in_study(url, STUDY_A, lambda c: c.put(a_relief(), OPTIONS, NOW))

    assert in_study(url, STUDY_A, lambda c: get(c, ReliefOptions(0, 100))) is None
    assert in_study(url, STUDY_A, lambda c: get(c, ReliefOptions(25, 500))) is None


def test_each_option_pair_keeps_its_own_entry(url):
    small = ReliefOptions(0, 100)
    in_study(url, STUDY_A, lambda c: c.put(a_relief(1.0), OPTIONS, NOW))
    in_study(url, STUDY_A, lambda c: c.put(a_relief(2.0, small), small, NOW))

    assert in_study(url, STUDY_A, get).grid.values[0] == 1.0
    assert in_study(url, STUDY_A, lambda c: get(c, small)).grid.values[0] == 2.0
    assert admin_rows(url, "SELECT count(*) FROM relief_cache") == [(2,)]


def test_another_study_does_not_see_the_entry(url):
    in_study(url, STUDY_A, lambda c: c.put(a_relief(), OPTIONS, NOW))

    assert in_study(url, STUDY_B, get) is None


def test_each_study_keeps_its_own_entry_for_the_same_reference(url):
    in_study(url, STUDY_A, lambda c: c.put(a_relief(1.0), OPTIONS, NOW))
    in_study(url, STUDY_B, lambda c: c.put(a_relief(2.0), OPTIONS, NOW))

    assert in_study(url, STUDY_A, get).grid.values[0] == 1.0
    assert in_study(url, STUDY_B, get).grid.values[0] == 2.0


def test_an_entry_is_valid_for_thirty_days_and_not_a_moment_longer(url):
    in_study(url, STUDY_A, lambda c: c.put(a_relief(), OPTIONS, NOW))

    just_inside = NOW + MAX_AGE
    just_outside = NOW + MAX_AGE + timedelta(seconds=1)
    assert in_study(url, STUDY_A, get, just_inside) is not None
    assert in_study(url, STUDY_A, get, just_outside) is None


def test_putting_again_replaces_the_entry_and_restarts_its_age(url):
    in_study(url, STUDY_A, lambda c: c.put(a_relief(1.0), OPTIONS, NOW))
    later = NOW + timedelta(days=40)
    in_study(url, STUDY_A, lambda c: c.put(a_relief(2.0), OPTIONS, later), later)

    assert in_study(url, STUDY_A, get, later).grid.values[0] == 2.0
    assert admin_rows(url, "SELECT count(*) FROM relief_cache") == [(1,)]


def test_the_payload_is_the_api_shape_as_json_and_the_key_names_the_options(url):
    relief = a_relief()
    in_study(url, STUDY_A, lambda c: c.put(relief, OPTIONS, NOW))

    assert admin_rows(url, "SELECT reference, window_key, payload FROM relief_cache") == [
        (REFERENCE, "m25-s300", relief.to_dict())
    ]


def test_the_application_role_cannot_delete_entries(url):
    in_study(url, STUDY_A, lambda c: c.put(a_relief(), OPTIONS, NOW))

    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with study_transaction(url, a_context(STUDY_A)) as conn:
            conn.execute("DELETE FROM relief_cache")


def test_the_application_role_cannot_truncate_the_table(url):
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with study_transaction(url, a_context(STUDY_A)) as conn:
            conn.execute("TRUNCATE relief_cache")


def test_a_reference_must_have_fourteen_characters(url):
    with psycopg.connect(url, autocommit=True) as admin:
        with pytest.raises(psycopg.errors.CheckViolation):
            admin.execute(
                "INSERT INTO relief_cache (study_id, reference, window_key, payload) "
                "VALUES (%s, 'SHORT', 'm25-s300', '{}')",
                (STUDY_A,),
            )


@pytest.mark.parametrize("key", ["", "m25", "m30-s300", "m25-s250", "M25-S300", "m25-s300 "])
def test_a_window_key_must_be_one_of_the_allowed_shapes(url, key):
    with psycopg.connect(url, autocommit=True) as admin:
        with pytest.raises(psycopg.errors.CheckViolation):
            admin.execute(
                "INSERT INTO relief_cache (study_id, reference, window_key, payload) "
                "VALUES (%s, %s, %s, '{}')",
                (STUDY_A, REFERENCE, key),
            )


def test_row_level_security_is_forced_on_the_table(url):
    assert admin_rows(
        url,
        "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'relief_cache'",
    ) == [(True, True)]


def test_an_entry_cannot_be_written_into_another_study(url):
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with study_transaction(url, a_context(STUDY_A)) as conn:
            conn.execute(
                "INSERT INTO relief_cache (study_id, reference, window_key, payload) "
                "VALUES (%s, %s, 'm25-s300', '{}')",
                (STUDY_B, REFERENCE),
            )
