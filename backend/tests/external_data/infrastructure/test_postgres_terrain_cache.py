"""The per-study terrain cache on real Postgres: isolation, expiry, upsert, constraints."""

from datetime import datetime, timedelta, timezone

import psycopg
import pytest

from backend.app.external_data.domain.terrain import TerrainProfile
from backend.app.external_data.infrastructure.postgres_terrain_cache import PostgresTerrainCache
from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role
from backend.tests.external_data.domain.test_plot import REFERENCE

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
NOW = datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc)
MAX_AGE = timedelta(days=30)
PROFILE = TerrainProfile(REFERENCE, 33.0, 4.2)


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
        return action(PostgresTerrainCache(conn, clock=lambda: now))


def admin_rows(url, sql, params=()):
    with psycopg.connect(url, autocommit=True) as admin:
        return admin.execute(sql, params).fetchall()


def test_a_stored_profile_is_read_back_equal(url):
    in_study(url, STUDY_A, lambda c: c.put(PROFILE, NOW))

    assert in_study(url, STUDY_A, lambda c: c.get(REFERENCE, MAX_AGE)) == PROFILE


def test_a_profile_without_slope_survives_the_round_trip(url):
    flat = TerrainProfile(REFERENCE, 12.5, None)
    in_study(url, STUDY_A, lambda c: c.put(flat, NOW))

    assert in_study(url, STUDY_A, lambda c: c.get(REFERENCE, MAX_AGE)) == flat


def test_an_unknown_reference_is_absent(url):
    assert in_study(url, STUDY_A, lambda c: c.get(REFERENCE, MAX_AGE)) is None


def test_another_study_does_not_see_the_entry(url):
    in_study(url, STUDY_A, lambda c: c.put(PROFILE, NOW))

    assert in_study(url, STUDY_B, lambda c: c.get(REFERENCE, MAX_AGE)) is None


def test_each_study_keeps_its_own_entry_for_the_same_reference(url):
    in_study(url, STUDY_A, lambda c: c.put(TerrainProfile(REFERENCE, 1.0, 1.0), NOW))
    in_study(url, STUDY_B, lambda c: c.put(TerrainProfile(REFERENCE, 2.0, 2.0), NOW))

    assert in_study(url, STUDY_A, lambda c: c.get(REFERENCE, MAX_AGE)).altitude_m == 1.0
    assert in_study(url, STUDY_B, lambda c: c.get(REFERENCE, MAX_AGE)).altitude_m == 2.0


def test_an_entry_is_valid_for_thirty_days_and_not_a_moment_longer(url):
    in_study(url, STUDY_A, lambda c: c.put(PROFILE, NOW))

    just_inside = NOW + MAX_AGE
    just_outside = NOW + MAX_AGE + timedelta(seconds=1)
    assert in_study(url, STUDY_A, lambda c: c.get(REFERENCE, MAX_AGE), just_inside) is not None
    assert in_study(url, STUDY_A, lambda c: c.get(REFERENCE, MAX_AGE), just_outside) is None


def test_putting_again_replaces_the_entry_and_restarts_its_age(url):
    in_study(url, STUDY_A, lambda c: c.put(TerrainProfile(REFERENCE, 1.0, 1.0), NOW))
    later = NOW + timedelta(days=40)
    in_study(url, STUDY_A, lambda c: c.put(TerrainProfile(REFERENCE, 2.0, 2.0), later), later)

    stored = in_study(url, STUDY_A, lambda c: c.get(REFERENCE, MAX_AGE), later)
    assert stored.altitude_m == 2.0
    assert admin_rows(url, "SELECT count(*) FROM terrain_cache") == [(1,)]


def test_the_payload_is_the_api_shape_as_json(url):
    in_study(url, STUDY_A, lambda c: c.put(PROFILE, NOW))

    assert admin_rows(url, "SELECT payload FROM terrain_cache") == [(PROFILE.to_dict(),)]


def test_the_application_role_cannot_delete_entries(url):
    in_study(url, STUDY_A, lambda c: c.put(PROFILE, NOW))

    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with study_transaction(url, a_context(STUDY_A)) as conn:
            conn.execute("DELETE FROM terrain_cache")


def test_the_application_role_cannot_truncate_the_table(url):
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with study_transaction(url, a_context(STUDY_A)) as conn:
            conn.execute("TRUNCATE terrain_cache")


def test_a_reference_must_have_fourteen_characters(url):
    with psycopg.connect(url, autocommit=True) as admin:
        with pytest.raises(psycopg.errors.CheckViolation):
            admin.execute(
                "INSERT INTO terrain_cache (study_id, reference, payload) "
                "VALUES (%s, 'SHORT', '{}')",
                (STUDY_A,),
            )


def test_row_level_security_is_forced_on_the_table(url):
    assert admin_rows(
        url,
        "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'terrain_cache'",
    ) == [(True, True)]


def test_an_entry_cannot_be_written_into_another_study(url):
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with study_transaction(url, a_context(STUDY_A)) as conn:
            conn.execute(
                "INSERT INTO terrain_cache (study_id, reference, payload) VALUES (%s, %s, '{}')",
                (STUDY_B, REFERENCE),
            )
