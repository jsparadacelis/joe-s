import pytest

from backend.app.ciclo_de_vida.domain.autoridad import quien_puede, tiene_autoridad
from backend.app.estudio.domain.contexto import ContextoDeSolicitud, Habilitacion, Rol


def a_context(rol=Rol.ARQUITECTO, habilitaciones=()):
    return ContextoDeSolicitud(
        estudio_id="estudio-demo",
        usuario_id="usuario-demo",
        rol=rol,
        habilitaciones=frozenset(habilitaciones),
    )


class TestTieneAutoridad:
    @pytest.mark.parametrize("rol", [Rol.SOCIO, Rol.DIRECTOR])
    def test_partner_and_director_hold_socio_director(self, rol):
        assert tiene_autoridad("socio_director", a_context(rol)) is True

    @pytest.mark.parametrize(
        "rol",
        [Rol.DIRECTOR_DE_PROYECTO, Rol.LIDER_TECNICO, Rol.ARQUITECTO, Rol.COLABORADOR_DE_OBRA],
    )
    def test_other_roles_do_not_hold_socio_director(self, rol):
        assert tiene_autoridad("socio_director", a_context(rol)) is False

    def test_project_director_holds_director_de_proyecto(self):
        assert tiene_autoridad("director_de_proyecto", a_context(Rol.DIRECTOR_DE_PROYECTO)) is True

    def test_partner_does_not_hold_director_de_proyecto(self):
        assert tiene_autoridad("director_de_proyecto", a_context(Rol.SOCIO)) is False

    @pytest.mark.parametrize(
        ("autoridad", "habilitacion"),
        [
            ("firmante_habilitado", Habilitacion.FIRMANTE_HABILITADO),
            ("direccion_facultativa", Habilitacion.DIRECCION_FACULTATIVA),
            ("sponsor", Habilitacion.SPONSOR),
        ],
    )
    def test_qualified_authorities_need_the_matching_qualification(self, autoridad, habilitacion):
        assert tiene_autoridad(autoridad, a_context(habilitaciones=[habilitacion])) is True
        assert tiene_autoridad(autoridad, a_context(Rol.SOCIO)) is False

    def test_a_qualification_does_not_grant_another_authority(self):
        context = a_context(habilitaciones=[Habilitacion.SPONSOR])

        assert tiene_autoridad("firmante_habilitado", context) is False

    def test_unknown_authority_is_never_granted(self):
        assert tiene_autoridad("inventada", a_context(Rol.SOCIO)) is False


class TestQuienPuede:
    @pytest.mark.parametrize(
        ("autoridad", "etiquetas"),
        [
            ("socio_director", ["Socio", "Director"]),
            ("director_de_proyecto", ["Director de proyecto"]),
            ("firmante_habilitado", ["Firmante habilitado"]),
            ("direccion_facultativa", ["Dirección facultativa"]),
            ("sponsor", ["Sponsor"]),
        ],
    )
    def test_names_who_can_act_in_spanish(self, autoridad, etiquetas):
        assert quien_puede(autoridad) == etiquetas
