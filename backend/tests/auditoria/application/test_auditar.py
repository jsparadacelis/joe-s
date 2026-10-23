from unittest.mock import create_autospec

import pytest

from backend.app.auditoria.application.auditar import audit
from backend.app.auditoria.domain.evento import EventoDeAuditoria, Resultado
from backend.app.auditoria.domain.ports import RegistroDeAuditoria
from backend.app.estudio.domain.contexto import ContextoDeSolicitud, Rol


@pytest.fixture
def registro():
    return create_autospec(RegistroDeAuditoria, spec_set=True, instance=True)


@pytest.fixture
def contexto():
    return ContextoDeSolicitud(estudio_id="estudio-demo", usuario_id="usuario-demo", rol=Rol.SOCIO)


class TestAudit:
    def test_registers_an_event_built_from_the_request_context(self, registro, contexto):
        audit(
            registro,
            contexto,
            entidad="proyecto",
            entidad_id="PRY-EJ-001",
            accion="promover",
            valor_anterior={"fase": 2},
            valor_nuevo={"fase": 3},
            version=1,
        )

        registro.registrar.assert_called_once_with(
            EventoDeAuditoria(
                estudio_id="estudio-demo",
                usuario_id="usuario-demo",
                entidad="proyecto",
                entidad_id="PRY-EJ-001",
                accion="promover",
                valor_anterior={"fase": 2},
                valor_nuevo={"fase": 3},
                version=1,
                resultado=Resultado.OK,
            )
        )

    def test_can_record_a_rejected_attempt(self, registro, contexto):
        audit(
            registro,
            contexto,
            entidad="proyecto",
            entidad_id="PRY-EJ-001",
            accion="promover",
            resultado=Resultado.RECHAZADO,
        )

        event = registro.registrar.call_args.args[0]
        assert event.resultado is Resultado.RECHAZADO

    def test_invalid_event_is_not_registered(self, registro, contexto):
        with pytest.raises(ValueError):
            audit(registro, contexto, entidad="", entidad_id="1", accion="promover")

        registro.registrar.assert_not_called()
