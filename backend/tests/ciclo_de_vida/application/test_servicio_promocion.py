from unittest.mock import create_autospec

import pytest

from backend.app.auditoria.domain.evento import Resultado
from backend.app.auditoria.domain.ports import RegistroDeAuditoria
from backend.app.ciclo_de_vida.application.servicio_promocion import ServicioDePromocion
from backend.app.ciclo_de_vida.domain.entregable import EntregableDeSalida
from backend.app.ciclo_de_vida.domain.errores import (
    AccionNoPermitida,
    EntregableIncompleto,
    MotivoObligatorio,
    ProyectoNoEncontrado,
    SinAutoridad,
    SinFaseSiguiente,
)
from backend.app.ciclo_de_vida.domain.ports import CicloDeVidaRepositorio, ValidadorDeEntregable
from backend.app.ciclo_de_vida.domain.promocion import Accion, Promocion
from backend.app.ciclo_de_vida.domain.proyecto import Proyecto
from backend.app.ciclo_de_vida.domain.version_congelada import VersionCongelada
from backend.app.estudio.domain.contexto import ContextoDeSolicitud, Habilitacion, Rol

CODIGO = "PRY-EJ-001"


def a_project(fase):
    return Proyecto(
        id="proyecto-1",
        estudio_id="estudio-demo",
        codigo=CODIGO,
        nombre="Vivienda (ejemplo)",
        fase_actual=fase,
    )


def a_context(rol=Rol.DIRECTOR_DE_PROYECTO, habilitaciones=()):
    return ContextoDeSolicitud(
        estudio_id="estudio-demo",
        usuario_id="usuario-demo",
        rol=rol,
        habilitaciones=frozenset(habilitaciones),
    )


def a_deliverable(fase, **overrides):
    values = {
        "fase": fase,
        "contenido": {"titulo": "Brief (ejemplo)"},
        "completo": True,
        "aprobado": True,
    }
    return EntregableDeSalida(**{**values, **overrides})


@pytest.fixture
def repo():
    repo = create_autospec(CicloDeVidaRepositorio, spec_set=True, instance=True)
    repo.obtener_proyecto.return_value = a_project(fase=2)
    repo.obtener_entregable.return_value = a_deliverable(fase=2)
    repo.proxima_version.return_value = 1
    return repo


@pytest.fixture
def auditoria():
    return create_autospec(RegistroDeAuditoria, spec_set=True, instance=True)


@pytest.fixture
def validators():
    return {}


@pytest.fixture
def service(repo, auditoria, validators):
    return ServicioDePromocion(repo, auditoria, validators)


def audited(auditoria):
    return auditoria.registrar.call_args.args[0]


class TestPromover:
    def test_moves_the_project_to_the_next_phase(self, service, repo):
        transition = service.promover(a_context(), CODIGO)

        repo.cambiar_fase.assert_called_once_with("proyecto-1", 3)
        assert (transition.ok, transition.fase_anterior, transition.fase_actual) == (True, 2, 3)

    def test_freezes_the_deliverable_as_the_next_version(self, service, repo):
        repo.proxima_version.return_value = 4

        transition = service.promover(a_context(), CODIGO)

        frozen = repo.congelar.call_args.args[0]
        assert isinstance(frozen, VersionCongelada)
        assert (frozen.fase, frozen.version, frozen.contenido, frozen.congelada_por) == (
            2,
            4,
            {"titulo": "Brief (ejemplo)"},
            "usuario-demo",
        )
        assert transition.version_congelada == 4

    def test_records_the_promotion_and_opens_the_next_phase(self, service, repo):
        service.promover(a_context(), CODIGO)

        promotion = repo.registrar_promocion.call_args.args[0]
        assert isinstance(promotion, Promocion)
        assert (promotion.accion, promotion.de_fase, promotion.a_fase) == (Accion.PROMOVER, 2, 3)
        repo.abrir_entregable.assert_called_once_with("proyecto-1", 3)

    def test_audits_who_what_and_the_version(self, service, auditoria):
        service.promover(a_context(), CODIGO)

        event = audited(auditoria)
        assert (event.entidad, event.entidad_id, event.accion, event.usuario_id) == (
            "proyecto",
            CODIGO,
            "promover",
            "usuario-demo",
        )
        assert (event.valor_anterior, event.valor_nuevo, event.version, event.resultado) == (
            {"fase": 2},
            {"fase": 3},
            1,
            Resultado.OK,
        )

    def test_unknown_project_raises(self, service, repo):
        repo.obtener_proyecto.return_value = None

        with pytest.raises(ProyectoNoEncontrado):
            service.promover(a_context(), CODIGO)

    def test_the_project_is_locked_for_the_whole_operation(self, service, repo):
        service.promover(a_context(), CODIGO)

        repo.obtener_proyecto.assert_called_once_with(CODIGO)


class TestPromoverRechazada:
    def test_without_authority_names_who_can_and_changes_nothing(self, service, repo):
        transition = service.promover(a_context(Rol.ARQUITECTO), CODIGO)

        assert transition.ok is False
        assert isinstance(transition.error, SinAutoridad)
        assert transition.error.pueden == ["Director de proyecto"]
        repo.congelar.assert_not_called()
        repo.cambiar_fase.assert_not_called()

    def test_with_the_right_qualification_a_qualified_phase_is_allowed(self, service, repo):
        repo.obtener_proyecto.return_value = a_project(fase=4)
        repo.obtener_entregable.return_value = a_deliverable(fase=4)
        context = a_context(Rol.ARQUITECTO, [Habilitacion.FIRMANTE_HABILITADO])

        transition = service.promover(context, CODIGO)

        assert transition.ok is True

    @pytest.mark.parametrize(
        ("overrides", "missing"),
        [
            (
                {"completo": False, "aprobado": False},
                ["entregable de salida completo", "aprobación del entregable"],
            ),
            ({"aprobado": False}, ["aprobación del entregable"]),
        ],
    )
    def test_incomplete_deliverable_reports_what_is_missing(
        self, service, repo, overrides, missing
    ):
        repo.obtener_entregable.return_value = a_deliverable(fase=2, **overrides)

        transition = service.promover(a_context(), CODIGO)

        assert isinstance(transition.error, EntregableIncompleto)
        assert transition.error.faltantes == missing
        repo.congelar.assert_not_called()
        repo.cambiar_fase.assert_not_called()

    def test_missing_deliverable_counts_as_incomplete(self, service, repo):
        repo.obtener_entregable.return_value = None

        transition = service.promover(a_context(), CODIGO)

        assert transition.error.faltantes == ["entregable de salida"]

    def test_phase_validator_can_block_the_promotion(self, service, repo, validators):
        validator = create_autospec(ValidadorDeEntregable, spec_set=True, instance=True)
        validator.validar.return_value = ["referencia catastral"]
        validators[2] = validator

        transition = service.promover(a_context(), CODIGO)

        assert transition.error.faltantes == ["referencia catastral"]

    def test_closing_phase_has_no_next_phase(self, service, repo):
        repo.obtener_proyecto.return_value = a_project(fase=7)
        context = a_context(Rol.ARQUITECTO, [Habilitacion.SPONSOR])

        transition = service.promover(context, CODIGO)

        assert isinstance(transition.error, SinFaseSiguiente)

    def test_every_rejection_is_audited_with_its_reason(self, service, auditoria):
        service.promover(a_context(Rol.ARQUITECTO), CODIGO)

        event = audited(auditoria)
        assert (event.accion, event.resultado, event.valor_nuevo) == (
            "promover",
            Resultado.RECHAZADO,
            {"error": "sin_autoridad"},
        )

    def test_a_rejection_does_not_record_a_promotion(self, service, repo):
        service.promover(a_context(Rol.ARQUITECTO), CODIGO)

        repo.registrar_promocion.assert_not_called()


class TestRetener:
    def test_records_the_hold_with_its_reason_and_keeps_the_phase(self, service, repo, auditoria):
        transition = service.retener(a_context(), CODIGO, "Falta el topográfico")

        promotion = repo.registrar_promocion.call_args.args[0]
        assert (promotion.accion, promotion.de_fase, promotion.a_fase, promotion.motivo) == (
            Accion.RETENER,
            2,
            None,
            "Falta el topográfico",
        )
        repo.cambiar_fase.assert_not_called()
        assert (transition.ok, transition.fase_actual) == (True, 2)
        assert audited(auditoria).valor_nuevo == {"fase": 2, "motivo": "Falta el topográfico"}

    @pytest.mark.parametrize("reason", [None, "", "   "])
    def test_requires_a_reason(self, service, repo, reason):
        transition = service.retener(a_context(), CODIGO, reason)

        assert isinstance(transition.error, MotivoObligatorio)
        repo.registrar_promocion.assert_not_called()

    def test_requires_authority_in_the_current_phase(self, service):
        transition = service.retener(a_context(Rol.ARQUITECTO), CODIGO, "motivo")

        assert isinstance(transition.error, SinAutoridad)


class TestNoPerseguir:
    def test_records_the_decision_from_the_opportunity_phase(self, service, repo):
        repo.obtener_proyecto.return_value = a_project(fase=0)

        transition = service.no_perseguir(a_context(Rol.SOCIO), CODIGO, "Fuera de umbral")

        promotion = repo.registrar_promocion.call_args.args[0]
        assert (promotion.accion, promotion.de_fase, promotion.motivo) == (
            Accion.NO_PERSEGUIR,
            0,
            "Fuera de umbral",
        )
        assert transition.ok is True

    @pytest.mark.parametrize("fase", [1, 3, 7])
    def test_is_not_allowed_after_the_opportunity_phase(self, service, repo, fase):
        repo.obtener_proyecto.return_value = a_project(fase=fase)

        transition = service.no_perseguir(a_context(Rol.SOCIO), CODIGO, "motivo")

        assert isinstance(transition.error, AccionNoPermitida)
        repo.registrar_promocion.assert_not_called()

    def test_requires_a_reason(self, service, repo):
        repo.obtener_proyecto.return_value = a_project(fase=0)

        transition = service.no_perseguir(a_context(Rol.SOCIO), CODIGO, " ")

        assert isinstance(transition.error, MotivoObligatorio)

    def test_requires_authority(self, service, repo):
        repo.obtener_proyecto.return_value = a_project(fase=0)

        transition = service.no_perseguir(a_context(Rol.ARQUITECTO), CODIGO, "motivo")

        assert transition.error.pueden == ["Socio", "Director"]
