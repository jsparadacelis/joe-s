import dataclasses

import pytest

from backend.app.estudio.domain.contexto import ContextoDeSolicitud, Rol


def a_context(**overrides):
    values = {"estudio_id": "estudio-demo", "usuario_id": "usuario-demo", "rol": Rol.SOCIO}
    return ContextoDeSolicitud(**{**values, **overrides})


class TestContextoDeSolicitud:
    def test_keeps_study_user_and_role(self):
        context = a_context()

        assert (context.estudio_id, context.usuario_id, context.rol) == (
            "estudio-demo",
            "usuario-demo",
            Rol.SOCIO,
        )

    @pytest.mark.parametrize("field", ["estudio_id", "usuario_id"])
    @pytest.mark.parametrize("blank", ["", "   "])
    def test_rejects_blank_identifiers(self, field, blank):
        with pytest.raises(ValueError):
            a_context(**{field: blank})

    def test_is_immutable(self):
        context = a_context()

        with pytest.raises(dataclasses.FrozenInstanceError):
            context.estudio_id = "otro"


def test_roles_are_the_prd_roles():
    assert {r.value for r in Rol} == {
        "socio",
        "director",
        "director_de_proyecto",
        "lider_tecnico",
        "arquitecto",
        "colaborador_de_obra",
    }
