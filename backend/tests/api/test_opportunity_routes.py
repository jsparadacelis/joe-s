"""Opportunity, portfolio and project routes: contract shapes and errors."""

from contextlib import contextmanager
from datetime import date
from unittest.mock import create_autospec

import psycopg
import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import (
    get_settings,
    opportunity_unit_of_work,
    portfolio_unit_of_work,
)
from backend.app.api.main import create_app
from backend.app.opportunity.application.create_opportunity import (
    CreatedOpportunity,
    CreateOpportunity,
)
from backend.app.opportunity.domain.errors import InvalidField, RequiredField
from backend.app.opportunity.domain.opportunity import Opportunity
from backend.app.portfolio.application.queries import (
    Portfolio,
    PortfolioEntry,
    PortfolioPause,
    PortfolioQueries,
    ProjectSummary,
)
from backend.app.portfolio.domain.errors import ProjectNotFound
from backend.app.shared.config import Settings
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations

BODY = {
    "name": "Warehouse (sample)",
    "client": "Client (sample)",
    "location": "Town (sample)",
    "project_type": "industrial",
    "owner": "Owner (sample)",
}


@pytest.fixture
def create_service():
    return create_autospec(CreateOpportunity, spec_set=True, instance=True)


@pytest.fixture
def queries():
    return create_autospec(PortfolioQueries, spec_set=True, instance=True)


@pytest.fixture
def client(create_service, queries):
    app = create_app(Settings(_env_file=None))
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None)

    def fake(service):
        @contextmanager
        def unit(context):
            yield service

        return lambda: unit

    app.dependency_overrides[opportunity_unit_of_work] = fake(create_service)
    app.dependency_overrides[portfolio_unit_of_work] = fake(queries)
    return TestClient(app)


class TestCreate:
    def test_returns_201_with_the_contract_shape(self, client, create_service):
        opportunity = Opportunity.from_input(
            {**BODY, "estimated_budget": 125000, "deadline": "2026-12-31"}
        )
        create_service.execute.return_value = CreatedOpportunity("PRY-2026-001", opportunity)

        response = client.post("/api/opportunities", json=BODY)

        assert response.status_code == 201
        assert response.json() == {
            "code": "PRY-2026-001",
            "name": "Warehouse (sample)",
            "phase": 0,
            "status": "no_plan",
            "client": "Client (sample)",
            "location": "Town (sample)",
            "project_type": "industrial",
            "owner": "Owner (sample)",
            "estimated_budget": 125000.0,
            "deadline": "2026-12-31",
            "source": None,
            "decision_date": None,
        }

    def test_passes_the_raw_body_to_the_use_case(self, client, create_service):
        create_service.execute.return_value = CreatedOpportunity(
            "PRY-2026-001", Opportunity.from_input(BODY)
        )

        client.post("/api/opportunities", json={**BODY, "source": "x"})

        assert create_service.execute.call_args.args[1] == {**BODY, "source": "x"}

    def test_required_field_is_422_with_field_and_message(self, client, create_service):
        create_service.execute.side_effect = RequiredField("name")

        response = client.post("/api/opportunities", json={})

        assert response.status_code == 422
        assert response.json() == {
            "detail": {
                "code": "required_field",
                "message": "El campo «Nombre» es obligatorio.",
                "field": "name",
            }
        }

    def test_invalid_field_is_422(self, client, create_service):
        create_service.execute.side_effect = InvalidField("deadline", "debe ser una fecha")

        response = client.post("/api/opportunities", json=BODY)

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert (detail["code"], detail["field"]) == ("invalid_field", "deadline")
        assert detail["message"] == "El campo «Plazo» no es válido: debe ser una fecha."

    @pytest.mark.parametrize("body", [[], "text", 5])
    def test_a_body_that_is_not_an_object_is_invalid_request(self, client, body):
        response = client.post("/api/opportunities", json=body)

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_request"


class TestPortfolio:
    def test_returns_the_contract_shape(self, client, queries):
        queries.portfolio.return_value = Portfolio(
            as_of=date(2026, 10, 24),
            entries=[
                PortfolioEntry(
                    code="PRY-2026-001",
                    name="House (sample)",
                    phase=0,
                    status="no_plan",
                    next_milestone=None,
                    owner_id="Owner (sample)",
                    days_since_update=2,
                ),
                PortfolioEntry(
                    code="PRY-2026-002",
                    name="Other (sample)",
                    phase=3,
                    status="green",
                    next_milestone="Review (sample)",
                    owner_id=None,
                    days_since_update=0,
                ),
            ],
        )

        response = client.get("/api/portfolio")

        assert response.status_code == 200
        assert response.json() == {
            "as_of": "2026-10-24",
            "projects": [
                {
                    "code": "PRY-2026-001",
                    "name": "House (sample)",
                    "phase": 0,
                    "status": "no_plan",
                    "next_milestone": None,
                    "owner_id": "Owner (sample)",
                    "owner_name": None,
                    "blocker": None,
                    "days_since_update": 2,
                    "phase_weeks": None,
                    "pause": None,
                },
                {
                    "code": "PRY-2026-002",
                    "name": "Other (sample)",
                    "phase": 3,
                    "status": "green",
                    "next_milestone": {"name": "Review (sample)", "date": None},
                    "owner_id": None,
                    "owner_name": None,
                    "blocker": None,
                    "days_since_update": 0,
                    "phase_weeks": None,
                    "pause": None,
                },
            ],
        }

    def test_a_paused_project_carries_its_open_pause(self, client, queries):
        queries.portfolio.return_value = Portfolio(
            as_of=date(2026, 10, 24),
            entries=[
                PortfolioEntry(
                    code="PRY-2026-003",
                    name="Paused (sample)",
                    phase=2,
                    status="paused",
                    next_milestone=None,
                    owner_id=None,
                    days_since_update=0,
                    pause=PortfolioPause(
                        reason="authority_wait",
                        expected_resumption=date(2026, 10, 20),
                        overdue=True,
                        days_overdue=4,
                    ),
                )
            ],
        )

        project = client.get("/api/portfolio").json()["projects"][0]

        assert project["status"] == "paused"
        assert project["pause"] == {
            "reason": "authority_wait",
            "expected_resumption": "2026-10-20",
            "overdue": True,
            "days_overdue": 4,
        }

    def test_empty_portfolio(self, client, queries):
        queries.portfolio.return_value = Portfolio(as_of=date(2026, 10, 24), entries=[])

        assert client.get("/api/portfolio").json() == {"as_of": "2026-10-24", "projects": []}


class TestProject:
    def test_returns_code_name_and_current_phase(self, client, queries):
        queries.project.return_value = ProjectSummary("PRY-2026-001", "House (sample)", 0)

        response = client.get("/api/projects/PRY-2026-001")

        assert response.status_code == 200
        assert response.json() == {
            "code": "PRY-2026-001",
            "name": "House (sample)",
            "current_phase": 0,
        }

    def test_unknown_code_is_404_like_the_promotion_routes(self, client, queries):
        queries.project.side_effect = ProjectNotFound("PRY-2026-009")

        response = client.get("/api/projects/PRY-2026-009")

        assert response.status_code == 404
        assert response.json() == {
            "detail": {
                "code": "project_not_found",
                "message": "No existe el proyecto PRY-2026-009.",
            }
        }


def test_cors_allows_the_local_front(client):
    response = client.options(
        "/api/opportunities",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


@pytest.mark.integration
class TestEndToEndWithPostgres:
    """Real wiring: API, use case, adapters and RLS together."""

    STUDY_A = "11111111-1111-1111-1111-111111111111"
    STUDY_B = "22222222-2222-2222-2222-222222222222"

    @pytest.fixture
    def real_client(self, schema_url):
        url, _ = schema_url
        apply_migrations(url, MIGRATIONS_DIR)
        with psycopg.connect(url, autocommit=True) as admin:
            admin.execute(
                "INSERT INTO studies (id, name) VALUES (%s, 'A (sample)'), (%s, 'B (sample)')",
                (self.STUDY_A, self.STUDY_B),
            )

        def client_for(study_id):
            settings = Settings(_env_file=None, database_url=url, dev_study_id=study_id)
            app = create_app(settings)
            app.dependency_overrides[get_settings] = lambda: settings
            return TestClient(app)

        return client_for

    def test_create_then_read_portfolio_and_project(self, real_client):
        client = real_client(self.STUDY_A)

        created = client.post(
            "/api/opportunities", json={**BODY, "estimated_budget": 1234.5, "source": "Web"}
        )

        assert created.status_code == 201
        code = created.json()["code"]
        assert created.json()["estimated_budget"] == 1234.5
        portfolio = client.get("/api/portfolio").json()
        assert [
            (p["code"], p["phase"], p["status"], p["owner_id"]) for p in portfolio["projects"]
        ] == [(code, 0, "no_plan", "Owner (sample)")]
        assert portfolio["projects"][0]["days_since_update"] == 0
        assert client.get(f"/api/projects/{code}").json() == {
            "code": code,
            "name": "Warehouse (sample)",
            "current_phase": 0,
        }

    def test_another_study_sees_nothing(self, real_client):
        code = real_client(self.STUDY_A).post("/api/opportunities", json=BODY).json()["code"]
        other = real_client(self.STUDY_B)

        assert other.get("/api/portfolio").json()["projects"] == []
        assert other.get(f"/api/projects/{code}").status_code == 404

    def test_invalid_input_is_422_and_stores_nothing(self, real_client):
        client = real_client(self.STUDY_A)

        response = client.post("/api/opportunities", json={**BODY, "estimated_budget": -3})

        assert response.status_code == 422
        assert response.json()["detail"]["field"] == "estimated_budget"
        assert client.get("/api/portfolio").json()["projects"] == []

    def test_decimal_budget_is_serialized_as_a_number(self, real_client):
        created = real_client(self.STUDY_A).post(
            "/api/opportunities", json={**BODY, "estimated_budget": 0.1}
        )

        assert created.json()["estimated_budget"] == 0.1
