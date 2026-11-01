"""Technical data routes with simulated use cases: shape, statuses, Spanish errors."""

from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import (
    get_settings,
    refresh_technical_data_unit_of_work,
    technical_data_unit_of_work,
)
from backend.app.api.main import create_app
from backend.app.external_data.domain.cadastral_reference import InvalidCadastralReference
from backend.app.external_data.domain.errors import CadastreNotFound, CadastreUnavailable
from backend.app.lifecycle.domain.errors import NoAuthority
from backend.app.technical_data.application.common import TechnicalDataResult
from backend.app.technical_data.application.edit_datum import EditDatum
from backend.app.technical_data.application.get_technical_data import GetTechnicalData
from backend.app.technical_data.application.refresh_technical_data import RefreshTechnicalData
from backend.app.technical_data.application.restore_datum import RestoreDatum
from backend.app.technical_data.application.use_cases import TechnicalDataUseCases
from backend.app.technical_data.application.verify_all import VerifyAll
from backend.app.technical_data.application.verify_datum import VerifyDatum
from backend.app.technical_data.domain.catalog import CATALOG, Source
from backend.app.technical_data.domain.errors import (
    EmptyDatum,
    InvalidDatumValue,
    ProjectNotFound,
    TechnicalDataNotEditable,
    UnknownDatum,
)
from backend.app.technical_data.domain.ports import QueryRecord
from backend.tests.api.auth_support import dev_settings
from backend.tests.technical_data.application.support import a_row, a_sheet

URL = "/api/projects/PRY-T-001/technical-data"
REFERENCE = "9872023VH5797S0001WX"
QUERIED = QueryRecord(REFERENCE, datetime(2026, 10, 18, 23, 30, tzinfo=timezone.utc))


@pytest.fixture
def use_cases():
    return TechnicalDataUseCases(
        get=create_autospec(GetTechnicalData, spec_set=True, instance=True),
        edit=create_autospec(EditDatum, spec_set=True, instance=True),
        restore=create_autospec(RestoreDatum, spec_set=True, instance=True),
        verify=create_autospec(VerifyDatum, spec_set=True, instance=True),
        verify_all=create_autospec(VerifyAll, spec_set=True, instance=True),
    )


@pytest.fixture
def refresher():
    return create_autospec(RefreshTechnicalData, spec_set=True, instance=True)


@pytest.fixture
def client(use_cases, refresher):
    settings = dev_settings()
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    contexts = []

    @contextmanager
    def fake_unit(context):
        contexts.append(context)
        yield use_cases

    @contextmanager
    def fake_refresh_unit(context):
        contexts.append(context)
        yield refresher

    app.dependency_overrides[technical_data_unit_of_work] = lambda: fake_unit
    app.dependency_overrides[refresh_technical_data_unit_of_work] = lambda: fake_refresh_unit
    test_client = TestClient(app)
    test_client.contexts = contexts
    return test_client


def a_result(**overrides):
    sheet = a_sheet(
        a_row("builtArea", "142", value="138", verified=True),
        a_row("year", "1958"),
    )
    return TechnicalDataResult(**{"sheet": sheet, "last_query": QUERIED, **overrides})


def datum_json(body, field_id):
    return next(d for d in body["data"] if d["id"] == field_id)


class TestGet:
    def test_answers_the_complete_sheet_in_english_keys(self, client, use_cases):
        use_cases.get.execute.return_value = a_result()

        response = client.get(URL)

        assert response.status_code == 200
        body = response.json()
        assert set(body) == {"cadastral_reference", "queried_on", "data"}
        assert body["cadastral_reference"] == REFERENCE
        assert body["queried_on"] == "2026-10-18"
        assert [d["id"] for d in body["data"]] == [d.id for d in CATALOG]
        assert datum_json(body, "builtArea") == {
            "id": "builtArea",
            "value": "138",
            "original": "142",
            "verified": True,
            "edited": True,
            "source": "catastro",
        }
        assert datum_json(body, "maxHeight") == {
            "id": "maxHeight",
            "value": "",
            "original": None,
            "verified": False,
            "edited": False,
            "source": Source.MANUAL.value,
        }
        (context,) = client.contexts
        use_cases.get.execute.assert_called_once_with(context, "PRY-T-001")

    def test_a_project_never_queried_has_no_reference_or_date(self, client, use_cases):
        use_cases.get.execute.return_value = a_result(last_query=None)

        body = client.get(URL).json()

        assert body["cadastral_reference"] is None and body["queried_on"] is None

    def test_an_unknown_project_is_404(self, client, use_cases):
        use_cases.get.execute.return_value = TechnicalDataResult(error=ProjectNotFound())

        response = client.get(URL)

        assert response.status_code == 404
        assert response.json() == {
            "detail": {"code": "project_not_found", "message": "No existe ese proyecto."}
        }


class TestEdit:
    def test_answers_the_edited_datum(self, client, use_cases):
        use_cases.edit.execute.return_value = a_result()

        response = client.put(f"{URL}/builtArea", json={"value": "138"})

        assert response.status_code == 200
        assert response.json() == {
            "id": "builtArea",
            "value": "138",
            "original": "142",
            "verified": True,
            "edited": True,
            "source": "catastro",
        }
        (context,) = client.contexts
        use_cases.edit.execute.assert_called_once_with(context, "PRY-T-001", "builtArea", "138")

    @pytest.mark.parametrize(
        ("error", "status", "code"),
        [
            (ProjectNotFound(), 404, "project_not_found"),
            (UnknownDatum(), 404, "unknown_datum"),
            (NoAuthority(2, ["Director de proyecto"]), 403, "no_authority"),
            (TechnicalDataNotEditable(), 409, "technical_data_not_editable"),
            (
                InvalidDatumValue("Introduce un número, con coma o punto decimal."),
                422,
                "invalid_datum_value",
            ),
        ],
    )
    def test_errors_use_the_detail_code_message_shape(self, client, use_cases, error, status, code):
        use_cases.edit.execute.return_value = TechnicalDataResult(error=error)

        response = client.put(f"{URL}/builtArea", json={"value": "x"})

        assert response.status_code == status
        assert response.json()["detail"]["code"] == code
        assert response.json()["detail"]["message"] == error.message

    def test_a_refusal_for_lack_of_authority_says_who_can(self, client, use_cases):
        use_cases.edit.execute.return_value = TechnicalDataResult(
            error=NoAuthority(2, ["Director de proyecto"])
        )

        detail = client.put(f"{URL}/builtArea", json={"value": "x"}).json()["detail"]

        assert detail["allowed"] == ["Director de proyecto"]

    def test_a_body_without_value_is_422(self, client, use_cases):
        response = client.put(f"{URL}/builtArea", json={})

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_request"
        use_cases.edit.execute.assert_not_called()

    def test_a_value_that_is_not_text_reaches_the_use_case_to_be_rejected_and_audited(
        self, client, use_cases
    ):
        use_cases.edit.execute.return_value = TechnicalDataResult(error=InvalidDatumValue("Mal."))

        response = client.put(f"{URL}/builtArea", json={"value": 142})

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_datum_value"
        assert use_cases.edit.execute.call_args.args[3] == 142


class TestRestoreAndVerify:
    def test_restore_answers_the_datum(self, client, use_cases):
        use_cases.restore.execute.return_value = a_result()

        response = client.post(f"{URL}/builtArea/restore")

        assert response.status_code == 200
        assert response.json()["id"] == "builtArea"
        (context,) = client.contexts
        use_cases.restore.execute.assert_called_once_with(context, "PRY-T-001", "builtArea")

    def test_verify_answers_the_datum(self, client, use_cases):
        use_cases.verify.execute.return_value = a_result()

        response = client.post(f"{URL}/year/verify")

        assert response.status_code == 200
        assert response.json()["id"] == "year"
        (context,) = client.contexts
        use_cases.verify.execute.assert_called_once_with(context, "PRY-T-001", "year")

    def test_verifying_an_empty_datum_is_422(self, client, use_cases):
        use_cases.verify.execute.return_value = TechnicalDataResult(error=EmptyDatum())

        response = client.post(f"{URL}/maxHeight/verify")

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "empty_datum"

    @pytest.mark.parametrize("operation", ["restore", "verify"])
    def test_refusals_map_to_their_statuses(self, client, use_cases, operation):
        getattr(use_cases, operation).execute.return_value = TechnicalDataResult(
            error=TechnicalDataNotEditable()
        )

        assert client.post(f"{URL}/year/{operation}").status_code == 409

    def test_verify_all_answers_the_whole_sheet(self, client, use_cases):
        use_cases.verify_all.execute.return_value = a_result()

        response = client.post(f"{URL}/verify-all")

        assert response.status_code == 200
        assert [d["id"] for d in response.json()["data"]] == [d.id for d in CATALOG]
        (context,) = client.contexts
        use_cases.verify_all.execute.assert_called_once_with(context, "PRY-T-001")

    def test_verify_all_without_authority_is_403(self, client, use_cases):
        use_cases.verify_all.execute.return_value = TechnicalDataResult(
            error=NoAuthority(2, ["Director de proyecto"])
        )

        assert client.post(f"{URL}/verify-all").status_code == 403


class TestRefresh:
    def test_answers_the_sheet_and_the_unmapped_fields(self, client, refresher):
        refresher.execute.return_value = a_result(unmapped=("use", "year"))

        response = client.post(f"{URL}/refresh", json={"cadastral_reference": REFERENCE})

        assert response.status_code == 200
        body = response.json()
        assert body["unmapped"] == ["use", "year"]
        assert body["cadastral_reference"] == REFERENCE
        assert [d["id"] for d in body["data"]] == [d.id for d in CATALOG]
        (context,) = client.contexts
        refresher.execute.assert_called_once_with(context, "PRY-T-001", REFERENCE)

    @pytest.mark.parametrize(
        ("error", "status", "code"),
        [
            (CadastreUnavailable(), 503, "cadastre_unavailable"),
            (CadastreNotFound(), 404, "cadastral_reference_not_found"),
            (
                InvalidCadastralReference("plot_reference_only", "Es la parcela."),
                422,
                "plot_reference_only",
            ),
        ],
    )
    def test_a_catastro_failure_is_reported_with_its_own_status(
        self, client, refresher, error, status, code
    ):
        refresher.execute.side_effect = error

        response = client.post(f"{URL}/refresh", json={"cadastral_reference": REFERENCE})

        assert response.status_code == status
        assert response.json() == {"detail": {"code": code, "message": error.message}}

    @pytest.mark.parametrize(
        ("error", "status"),
        [
            (ProjectNotFound(), 404),
            (NoAuthority(2, ["Director de proyecto"]), 403),
            (TechnicalDataNotEditable(), 409),
        ],
    )
    def test_refusals_map_to_their_statuses(self, client, refresher, error, status):
        refresher.execute.return_value = TechnicalDataResult(error=error)

        response = client.post(f"{URL}/refresh", json={"cadastral_reference": REFERENCE})

        assert response.status_code == status

    @pytest.mark.parametrize("body", [{}, {"cadastral_reference": 5}, {"other": "x"}])
    def test_a_malformed_body_is_422(self, client, refresher, body):
        response = client.post(f"{URL}/refresh", json=body)

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_request"
        refresher.execute.assert_not_called()


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", ""),
        ("put", "/year"),
        ("post", "/year/restore"),
        ("post", "/year/verify"),
        ("post", "/verify-all"),
        ("post", "/refresh"),
    ],
)
def test_every_route_requires_authentication_outside_dev_mode(method, path):
    from backend.tests.api.auth_support import supabase_client

    response = getattr(supabase_client(None), method)(URL + path)

    assert response.status_code == 401
