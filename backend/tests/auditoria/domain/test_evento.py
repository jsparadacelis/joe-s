import dataclasses

import pytest

from backend.app.auditoria.domain.evento import EventoDeAuditoria, Resultado


def an_event(**overrides):
    values = {
        "estudio_id": "estudio-demo",
        "usuario_id": "usuario-demo",
        "entidad": "proyecto",
        "entidad_id": "PRY-EJ-001",
        "accion": "promover",
    }
    return EventoDeAuditoria(**{**values, **overrides})


class TestEventoDeAuditoria:
    def test_defaults_to_successful_without_values_or_version(self):
        event = an_event()

        assert (event.resultado, event.version, event.valor_anterior, event.valor_nuevo) == (
            Resultado.OK,
            None,
            None,
            None,
        )

    def test_keeps_before_and_after_values(self):
        event = an_event(valor_anterior={"fase": 2}, valor_nuevo={"fase": 3}, version=4)

        assert (event.valor_anterior, event.valor_nuevo, event.version) == (
            {"fase": 2},
            {"fase": 3},
            4,
        )

    @pytest.mark.parametrize(
        "field", ["estudio_id", "usuario_id", "entidad", "entidad_id", "accion"]
    )
    @pytest.mark.parametrize("blank", ["", "  "])
    def test_rejects_blank_required_fields(self, field, blank):
        with pytest.raises(ValueError):
            an_event(**{field: blank})

    @pytest.mark.parametrize("version", [0, -1])
    def test_rejects_non_positive_version(self, version):
        with pytest.raises(ValueError):
            an_event(version=version)

    def test_is_immutable(self):
        event = an_event()

        with pytest.raises(dataclasses.FrozenInstanceError):
            event.accion = "otra"
