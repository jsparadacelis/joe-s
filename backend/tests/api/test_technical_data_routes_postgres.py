"""Technical data routes against real Postgres with a simulated Catastro: the full path
through RLS, the persisted data and the audit log."""

from unittest.mock import create_autospec

import psycopg
import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import cadastre_gateway, get_settings
from backend.app.api.main import create_app
from backend.app.external_data.domain.errors import CadastreUnavailable
from backend.app.external_data.domain.ports import CadastreGateway
from backend.app.shared.config import Settings
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.technical_data.domain.catalog import CATALOG
from backend.tests.external_data.domain.test_cadastral_property import REFERENCE, a_property

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
CODE = "PRY-T-001"
URL = f"/api/projects/{CODE}/technical-data"


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
            "(%s, %s, 'House (sample)', 2), (%s, 'PRY-T-002', 'Design (sample)', 3), "
            "(%s, 'PRY-T-003', 'Other (sample)', 2)",
            (STUDY_A, CODE, STUDY_A, STUDY_B),
        )
    return url


@pytest.fixture
def gateway():
    stub = create_autospec(CadastreGateway, spec_set=True, instance=True)
    stub.fetch.return_value = a_property()
    return stub


@pytest.fixture
def client_for(url, gateway):
    def make(study_id=STUDY_A, role="project_director"):
        settings = Settings(_env_file=None, database_url=url, dev_study_id=study_id, dev_role=role)
        app = create_app(settings)
        app.dependency_overrides[get_settings] = lambda: settings
        app.dependency_overrides[cadastre_gateway] = lambda: gateway
        return TestClient(app)

    return make


def admin_rows(url, sql, params=()):
    with psycopg.connect(url, autocommit=True) as admin:
        return admin.execute(sql, params).fetchall()


def audit(url, outcome="ok"):
    return admin_rows(
        url,
        "SELECT action, entity, entity_id, old_value, new_value FROM audit_events "
        "WHERE entity IN ('technical_datum', 'technical_data') AND outcome = %s ORDER BY id",
        (outcome,),
    )


def datum(body, field_id):
    return next(d for d in body["data"] if d["id"] == field_id)


def test_a_new_project_reads_as_the_blank_catalog(client_for):
    response = client_for().get(URL)

    assert response.status_code == 200
    body = response.json()
    assert body["cadastral_reference"] is None and body["queried_on"] is None
    assert [d["id"] for d in body["data"]] == [d.id for d in CATALOG]
    assert all(d["value"] == "" and d["original"] is None for d in body["data"])


def test_reading_needs_no_authority_over_the_project(client_for):
    assert client_for(role="architect").get(URL).status_code == 200


def test_query_edit_restore_verify_end_to_end(client_for, url):
    client = client_for()

    refreshed = client.post(f"{URL}/refresh", json={"cadastral_reference": REFERENCE.lower()})

    assert refreshed.status_code == 200
    assert refreshed.json()["unmapped"] == []
    body = client.get(URL).json()
    assert body["cadastral_reference"] == REFERENCE
    assert datum(body, "builtArea") == {
        "id": "builtArea",
        "value": "308",
        "original": "308",
        "verified": False,
        "edited": False,
        "source": "catastro",
    }

    edited = client.put(f"{URL}/builtArea", json={"value": "300.5"})
    assert edited.status_code == 200
    assert edited.json()["value"] == "300,5" and edited.json()["edited"] is True
    assert edited.json()["original"] == "308"

    assert client.post(f"{URL}/builtArea/verify").json()["verified"] is True
    restored = client.post(f"{URL}/builtArea/restore").json()
    assert (restored["value"], restored["verified"], restored["edited"]) == ("308", False, False)

    assert [row[0] for row in audit(url)] == ["refresh", "edit", "verify", "restore"]


def test_the_audit_keeps_before_and_after_of_an_edit(client_for, url):
    client = client_for()
    client.post(f"{URL}/refresh", json={"cadastral_reference": REFERENCE})
    client.put(f"{URL}/year", json={"value": "1990"})

    action, entity, entity_id, old, new = audit(url)[1]

    assert (action, entity, entity_id) == ("edit", "technical_datum", f"{CODE}/year")
    assert old == {"value": "1980", "verified": False}
    assert new == {"value": "1990", "verified": False}


def test_querying_again_keeps_the_planning_and_the_edits(client_for):
    client = client_for()
    client.post(f"{URL}/refresh", json={"cadastral_reference": REFERENCE})
    client.put(f"{URL}/maxHeight", json={"value": "10,5"})
    client.post(f"{URL}/maxHeight/verify")
    client.put(f"{URL}/builtArea", json={"value": "300"})
    client.post(f"{URL}/builtArea/verify")

    again = client.post(f"{URL}/refresh", json={"cadastral_reference": REFERENCE}).json()

    assert datum(again, "maxHeight")["value"] == "10,5"
    assert datum(again, "maxHeight")["verified"] is True
    assert datum(again, "maxHeight")["source"] == "manual"
    assert datum(again, "builtArea")["value"] == "300"
    assert datum(again, "builtArea")["verified"] is True


def test_verify_all_verifies_what_has_a_value(client_for, url):
    client = client_for()
    client.post(f"{URL}/refresh", json={"cadastral_reference": REFERENCE})

    body = client.post(f"{URL}/verify-all").json()

    assert datum(body, "builtArea")["verified"] is True
    assert datum(body, "maxHeight")["verified"] is False
    assert audit(url)[-1][0] == "verify_all"


def test_a_person_without_authority_is_403_and_the_refusal_is_audited(client_for, url):
    response = client_for(role="architect").put(f"{URL}/year", json={"value": "1990"})

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "no_authority"
    assert admin_rows(url, "SELECT count(*) FROM technical_data") == [(0,)]
    ((action, _, entity_id, _, new),) = audit(url, "rejected")
    assert (action, entity_id, new["error"]) == ("edit", f"{CODE}/year", "no_authority")


def test_outside_the_briefing_phase_it_is_409_and_nothing_changes(client_for, url, gateway):
    other = "/api/projects/PRY-T-002/technical-data"
    client = client_for()

    assert client.put(f"{other}/year", json={"value": "1990"}).status_code == 409
    assert client.post(f"{other}/year/verify").status_code == 409
    assert client.post(f"{other}/verify-all").status_code == 409
    assert (
        client.post(f"{other}/refresh", json={"cadastral_reference": REFERENCE}).status_code == 409
    )
    gateway.fetch.assert_not_called()
    assert admin_rows(url, "SELECT count(*) FROM technical_data") == [(0,)]
    assert len(audit(url, "rejected")) == 4
    assert client.get(other).status_code == 200


def test_an_invalid_value_is_422_and_audited(client_for, url):
    response = client_for().put(f"{URL}/builtArea", json={"value": "lots"})

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_datum_value"
    ((_, _, _, _, new),) = audit(url, "rejected")
    assert new["error"] == "invalid_datum_value"


def test_unknown_project_and_datum_are_404(client_for):
    client = client_for()

    assert client.get("/api/projects/PRY-T-999/technical-data").status_code == 404
    assert (
        client.put("/api/projects/PRY-T-999/technical-data/year", json={"value": "1"}).status_code
        == 404
    )
    unknown = client.put(f"{URL}/owner", json={"value": "x"})
    assert unknown.status_code == 404
    assert unknown.json()["detail"]["code"] == "unknown_datum"


def test_a_project_of_another_study_is_not_found_and_untouched(client_for, url):
    other_study = client_for(study_id=STUDY_B)

    assert other_study.get(URL).status_code == 404
    assert other_study.put(f"{URL}/year", json={"value": "1990"}).status_code == 404
    assert other_study.get("/api/projects/PRY-T-003/technical-data").status_code == 200
    assert admin_rows(url, "SELECT count(*) FROM technical_data") == [(0,)]


def test_when_the_catastro_fails_it_is_503_and_nothing_is_touched(client_for, url, gateway):
    client = client_for()
    client.post(f"{URL}/refresh", json={"cadastral_reference": REFERENCE})
    client.put(f"{URL}/builtArea", json={"value": "300"})
    before = admin_rows(url, "SELECT * FROM technical_data ORDER BY field_id")
    queries_before = admin_rows(url, "SELECT * FROM technical_data_queries")
    audit_before = len(audit(url))
    gateway.fetch.side_effect = CadastreUnavailable()

    response = client.post(f"{URL}/refresh", json={"cadastral_reference": "1234567VH1234S0001AA"})

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "cadastre_unavailable"
    assert admin_rows(url, "SELECT * FROM technical_data ORDER BY field_id") == before
    assert admin_rows(url, "SELECT * FROM technical_data_queries") == queries_before
    assert len(audit(url)) == audit_before


@pytest.mark.parametrize(
    ("reference", "status", "code"),
    [("ABC", 422, "invalid_cadastral_reference"), ("9872023VH5797S", 422, "plot_reference_only")],
)
def test_an_invalid_reference_is_422_and_the_catastro_is_not_called(
    client_for, gateway, reference, status, code
):
    response = client_for().post(f"{URL}/refresh", json={"cadastral_reference": reference})

    assert response.status_code == status
    assert response.json()["detail"]["code"] == code
    gateway.fetch.assert_not_called()
