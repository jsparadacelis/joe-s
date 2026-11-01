"""The per-study PVGIS cache on real Postgres: isolation, expiry, upsert, constraints."""

from datetime import datetime, timedelta, timezone

import psycopg
import pytest

from backend.app.external_data.domain.pv import PvLocation, PvYield
from backend.app.external_data.infrastructure.postgres_pv_cache import PostgresPvCache
from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
NOW = datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc)
MAX_AGE = timedelta(days=30)
LOCATION = PvLocation(38.640, 0.039)
YIELD = PvYield(LOCATION, 1617.61, 35.0, -3.0)


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
        return action(PostgresPvCache(conn, clock=lambda: now))


def admin_rows(url, sql, params=()):
    with psycopg.connect(url, autocommit=True) as admin:
        return admin.execute(sql, params).fetchall()


def test_a_stored_yield_is_read_back_equal(url):
    in_study(url, STUDY_A, lambda c: c.put(YIELD, NOW))

    assert in_study(url, STUDY_A, lambda c: c.get(LOCATION, MAX_AGE)) == YIELD


def test_the_row_is_keyed_by_the_rounded_location(url):
    in_study(url, STUDY_A, lambda c: c.put(YIELD, NOW))

    assert admin_rows(url, "SELECT location FROM pv_cache") == [("38.640,0.039",)]


def test_a_yield_without_angles_survives_the_round_trip(url):
    bare = PvYield(LOCATION, 1500.0)
    in_study(url, STUDY_A, lambda c: c.put(bare, NOW))

    assert in_study(url, STUDY_A, lambda c: c.get(LOCATION, MAX_AGE)) == bare


def test_a_nearby_position_hits_the_same_entry_and_a_distant_one_does_not(url):
    in_study(url, STUDY_A, lambda c: c.put(YIELD, NOW))

    assert in_study(url, STUDY_A, lambda c: c.get(PvLocation(38.6401, 0.0392), MAX_AGE)) == YIELD
    assert in_study(url, STUDY_A, lambda c: c.get(PvLocation(38.642, 0.039), MAX_AGE)) is None


def test_negative_coordinates_are_stored_and_found(url):
    west = PvYield(PvLocation(40.415, -3.707), 1700.0, 36.0, 0.0)
    in_study(url, STUDY_A, lambda c: c.put(west, NOW))

    assert in_study(url, STUDY_A, lambda c: c.get(west.location, MAX_AGE)) == west


def test_another_study_does_not_see_the_entry(url):
    in_study(url, STUDY_A, lambda c: c.put(YIELD, NOW))

    assert in_study(url, STUDY_B, lambda c: c.get(LOCATION, MAX_AGE)) is None


def test_an_entry_is_valid_for_thirty_days_and_not_a_moment_longer(url):
    in_study(url, STUDY_A, lambda c: c.put(YIELD, NOW))

    just_inside = NOW + MAX_AGE
    just_outside = NOW + MAX_AGE + timedelta(seconds=1)
    assert in_study(url, STUDY_A, lambda c: c.get(LOCATION, MAX_AGE), just_inside) is not None
    assert in_study(url, STUDY_A, lambda c: c.get(LOCATION, MAX_AGE), just_outside) is None


def test_putting_again_replaces_the_entry_and_restarts_its_age(url):
    in_study(url, STUDY_A, lambda c: c.put(PvYield(LOCATION, 1.0), NOW))
    later = NOW + timedelta(days=40)
    in_study(url, STUDY_A, lambda c: c.put(PvYield(LOCATION, 2.0), later), later)

    stored = in_study(url, STUDY_A, lambda c: c.get(LOCATION, MAX_AGE), later)
    assert stored.annual_kwh_per_kwp == 2.0
    assert admin_rows(url, "SELECT count(*) FROM pv_cache") == [(1,)]


def test_the_payload_is_the_api_shape_as_json(url):
    in_study(url, STUDY_A, lambda c: c.put(YIELD, NOW))

    assert admin_rows(url, "SELECT payload FROM pv_cache") == [(YIELD.to_dict(),)]


def test_the_application_role_cannot_delete_or_truncate(url):
    in_study(url, STUDY_A, lambda c: c.put(YIELD, NOW))

    for statement in ("DELETE FROM pv_cache", "TRUNCATE pv_cache"):
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with study_transaction(url, a_context(STUDY_A)) as conn:
                conn.execute(statement)


def test_a_location_key_must_have_the_rounded_format(url):
    with psycopg.connect(url, autocommit=True) as admin:
        with pytest.raises(psycopg.errors.CheckViolation):
            admin.execute(
                "INSERT INTO pv_cache (study_id, location, payload) VALUES (%s, '38.6,0.0', '{}')",
                (STUDY_A,),
            )


def test_row_level_security_is_forced_on_the_table(url):
    assert admin_rows(
        url,
        "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'pv_cache'",
    ) == [(True, True)]
