from contextlib import contextmanager
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import get_settings, unidad_de_trabajo
from backend.app.api.main import create_app
from backend.app.ciclo_de_vida.application.servicio_promocion import ServicioDePromocion, Transicion
from backend.app.ciclo_de_vida.domain.errores import (
    AccionNoPermitida,
    EntregableIncompleto,
    MotivoObligatorio,
    ProyectoNoEncontrado,
    SinAutoridad,
    SinFaseSiguiente,
)
from backend.app.shared.config import Settings


@pytest.fixture
def service():
    return create_autospec(ServicioDePromocion, spec_set=True, instance=True)


@pytest.fixture
def client(service):
    app = create_app(Settings(_env_file=None))
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None)

    @contextmanager
    def unit_of_work(contexto):
        yield service

    app.dependency_overrides[unidad_de_trabajo] = lambda: unit_of_work
    return TestClient(app)


def ok(**overrides):
    values = {
        "ok": True,
        "accion": "promover",
        "fase_anterior": 2,
        "fase_actual": 3,
        "version_congelada": 1,
        "error": None,
    }
    return Transicion(**{**values, **overrides})


def rejected(error, accion="promover", fase=2):
    return Transicion(
        ok=False,
        accion=accion,
        fase_anterior=fase,
        fase_actual=fase,
        version_congelada=None,
        error=error,
    )


class TestPromover:
    def test_returns_the_new_phase_and_the_frozen_version(self, client, service):
        service.promover.return_value = ok()

        response = client.post("/api/proyectos/PRY-EJ-001/promover")

        assert response.status_code == 200
        assert response.json() == {
            "codigo": "PRY-EJ-001",
            "accion": "promover",
            "fase_anterior": 2,
            "fase_actual": 3,
            "version_congelada": 1,
        }

    def test_without_authority_is_403_and_says_who_can(self, client, service):
        service.promover.return_value = rejected(
            SinAutoridad(fase=2, pueden=["Director de proyecto"])
        )

        response = client.post("/api/proyectos/PRY-EJ-001/promover")

        assert response.status_code == 403
        body = response.json()["detail"]
        assert body["codigo"] == "sin_autoridad"
        assert body["pueden"] == ["Director de proyecto"]
        assert "Director de proyecto" in body["mensaje"]

    def test_incomplete_deliverable_is_422_and_lists_what_is_missing(self, client, service):
        service.promover.return_value = rejected(
            EntregableIncompleto(["aprobación del entregable"])
        )

        response = client.post("/api/proyectos/PRY-EJ-001/promover")

        assert response.status_code == 422
        body = response.json()["detail"]
        assert body["codigo"] == "entregable_incompleto"
        assert body["faltantes"] == ["aprobación del entregable"]
        assert "aprobación del entregable" in body["mensaje"]

    def test_closing_phase_is_409(self, client, service):
        service.promover.return_value = rejected(SinFaseSiguiente(), fase=7)

        response = client.post("/api/proyectos/PRY-EJ-001/promover")

        assert response.status_code == 409

    def test_unknown_project_is_404(self, client, service):
        service.promover.side_effect = ProyectoNoEncontrado("PRY-X")

        response = client.post("/api/proyectos/PRY-X/promover")

        assert response.status_code == 404
        assert response.json()["detail"]["codigo"] == "proyecto_no_encontrado"


class TestRetenerYNoPerseguir:
    def test_hold_sends_the_reason(self, client, service):
        service.retener.return_value = ok(accion="retener", fase_actual=2, version_congelada=None)

        response = client.post("/api/proyectos/PRY-EJ-001/retener", json={"motivo": "Falta algo"})

        assert response.status_code == 200
        assert service.retener.call_args.args[1:] == ("PRY-EJ-001", "Falta algo")

    def test_hold_without_a_reason_in_the_body_is_422(self, client, service):
        response = client.post("/api/proyectos/PRY-EJ-001/retener", json={})

        assert response.status_code == 422
        service.retener.assert_not_called()

    def test_blank_reason_rejected_by_the_service_is_422(self, client, service):
        service.retener.return_value = rejected(MotivoObligatorio("retener"), accion="retener")

        response = client.post("/api/proyectos/PRY-EJ-001/retener", json={"motivo": " "})

        assert response.status_code == 422
        assert response.json()["detail"]["codigo"] == "motivo_obligatorio"

    def test_do_not_pursue_outside_phase_zero_is_409(self, client, service):
        service.no_perseguir.return_value = rejected(
            AccionNoPermitida("no_perseguir"), "no_perseguir", 3
        )

        response = client.post("/api/proyectos/PRY-EJ-001/no-perseguir", json={"motivo": "x"})

        assert response.status_code == 409

    def test_do_not_pursue_ok(self, client, service):
        service.no_perseguir.return_value = ok(
            accion="no_perseguir", fase_anterior=0, fase_actual=0, version_congelada=None
        )

        response = client.post("/api/proyectos/PRY-EJ-001/no-perseguir", json={"motivo": "Umbral"})

        assert response.status_code == 200
