import pytest

from backend.app.ciclo_de_vida.domain.fases import FASES, definicion_de_fase, fase_siguiente


class TestFases:
    def test_there_are_eight_phases_numbered_zero_to_seven(self):
        assert [f.id for f in FASES] == [0, 1, 2, 3, 4, 5, 6, 7]

    def test_names_follow_the_prd(self):
        assert [f.nombre for f in FASES] == [
            "Oportunidad",
            "Inicio",
            "Briefing y concepto",
            "Anteproyecto",
            "Proyecto básico",
            "Proyecto de ejecución",
            "Obra",
            "Cierre",
        ]

    def test_every_phase_has_an_exit_deliverable_and_an_authority(self):
        assert all(f.entregable_salida.strip() and f.autoridad.strip() for f in FASES)

    def test_authority_per_phase_follows_the_prd(self):
        assert [f.autoridad for f in FASES] == [
            "socio_director",
            "socio_director",
            "director_de_proyecto",
            "director_de_proyecto",
            "firmante_habilitado",
            "firmante_habilitado",
            "direccion_facultativa",
            "sponsor",
        ]


class TestDefinicionDeFase:
    def test_finds_a_phase_by_id(self):
        assert definicion_de_fase(3).nombre == "Anteproyecto"

    @pytest.mark.parametrize("fase", [-1, 8, 99])
    def test_rejects_unknown_phases(self, fase):
        with pytest.raises(ValueError):
            definicion_de_fase(fase)


class TestFaseSiguiente:
    def test_returns_the_following_phase(self):
        assert fase_siguiente(2) == 3

    def test_closing_phase_has_no_following_one(self):
        assert fase_siguiente(7) is None
