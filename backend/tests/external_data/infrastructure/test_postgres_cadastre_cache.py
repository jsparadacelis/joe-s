"""The per-study cadastre cache on real Postgres: isolation, expiry, no owner data."""

from datetime import datetime, timedelta, timezone

import httpx
import psycopg
import pytest

from backend.app.external_data.application.get_cadastral_property import GetCadastralProperty
from backend.app.external_data.infrastructure.http_cadastre_gateway import HttpCadastreGateway
from backend.app.external_data.infrastructure.postgres_cadastre_cache import (
    PostgresCadastreCache,
)
from backend.app.shared.db import study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role
from backend.tests.external_data.domain.test_cadastral_property import REFERENCE, a_property
from backend.tests.external_data.infrastructure.recorded import fixture, with_holder_fields

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
NOW = datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc)
MAX_AGE = timedelta(days=30)


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
        return action(PostgresCadastreCache(conn, clock=lambda: now))


def admin_rows(url, sql, params=()):
    with psycopg.connect(url, autocommit=True) as admin:
        return admin.execute(sql, params).fetchall()


def test_a_stored_property_is_read_back_equal(url):
    in_study(url, STUDY_A, lambda c: c.put(a_property(), NOW))

    assert in_study(url, STUDY_A, lambda c: c.get(REFERENCE, MAX_AGE)) == a_property()


def test_an_unknown_reference_is_absent(url):
    assert in_study(url, STUDY_A, lambda c: c.get(REFERENCE, MAX_AGE)) is None


def test_another_study_does_not_see_the_entry(url):
    in_study(url, STUDY_A, lambda c: c.put(a_property(), NOW))

    assert in_study(url, STUDY_B, lambda c: c.get(REFERENCE, MAX_AGE)) is None


def test_each_study_keeps_its_own_entry_for_the_same_reference(url):
    in_study(url, STUDY_A, lambda c: c.put(a_property(address="CL EJEMPLO 1"), NOW))
    in_study(url, STUDY_B, lambda c: c.put(a_property(address="CL EJEMPLO 2"), NOW))

    assert in_study(url, STUDY_A, lambda c: c.get(REFERENCE, MAX_AGE)).address == "CL EJEMPLO 1"
    assert in_study(url, STUDY_B, lambda c: c.get(REFERENCE, MAX_AGE)).address == "CL EJEMPLO 2"


def test_an_entry_is_valid_for_thirty_days_and_not_a_moment_longer(url):
    in_study(url, STUDY_A, lambda c: c.put(a_property(), NOW))

    just_inside = NOW + MAX_AGE
    just_outside = NOW + MAX_AGE + timedelta(seconds=1)
    assert in_study(url, STUDY_A, lambda c: c.get(REFERENCE, MAX_AGE), just_inside) is not None
    assert in_study(url, STUDY_A, lambda c: c.get(REFERENCE, MAX_AGE), just_outside) is None


def test_putting_again_replaces_the_entry_and_restarts_its_age(url):
    in_study(url, STUDY_A, lambda c: c.put(a_property(address="OLD"), NOW))
    later = NOW + timedelta(days=40)
    in_study(url, STUDY_A, lambda c: c.put(a_property(address="NEW"), later), later)

    assert in_study(url, STUDY_A, lambda c: c.get(REFERENCE, MAX_AGE), later).address == "NEW"
    assert admin_rows(url, "SELECT count(*) FROM cadastral_cache") == [(1,)]


def test_the_payload_is_the_domain_model_as_json_not_the_raw_xml(url):
    in_study(url, STUDY_A, lambda c: c.put(a_property(), NOW))

    ((payload,),) = admin_rows(url, "SELECT payload FROM cadastral_cache")

    assert payload == a_property().to_dict()


def test_a_response_with_holder_fields_leaves_no_trace_in_the_database(url):
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            content=with_holder_fields(fixture("dnprc_ok.xml"))
            if "Consulta_DNPRC" in request.url.path
            else fixture("cpmrc_ok.xml"),
        )
    )

    def look_up(cache):
        return GetCadastralProperty(HttpCadastreGateway(transport=transport), cache).execute(
            REFERENCE
        )

    in_study(url, STUDY_A, look_up)

    rows = admin_rows(url, "SELECT cadastral_cache::text FROM cadastral_cache")
    assert len(rows) == 1
    assert "HOLDER" not in rows[0][0] and "00000000T" not in rows[0][0]


def test_the_application_role_cannot_delete_entries(url):
    in_study(url, STUDY_A, lambda c: c.put(a_property(), NOW))

    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with study_transaction(url, a_context(STUDY_A)) as conn:
            conn.execute("DELETE FROM cadastral_cache")


def test_a_reference_must_have_twenty_characters(url):
    with psycopg.connect(url, autocommit=True) as admin:
        with pytest.raises(psycopg.errors.CheckViolation):
            admin.execute(
                "INSERT INTO cadastral_cache (study_id, reference, payload) "
                "VALUES (%s, 'SHORT', '{}')",
                (STUDY_A,),
            )


def test_the_table_is_protected_by_row_level_security(url):
    unprotected = [r[0] for r in admin_rows(url, "SELECT * FROM tables_without_rls()")]

    assert "cadastral_cache" not in unprotected
    assert unprotected == []
