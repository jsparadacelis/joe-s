import pytest

from backend.app.ciclo_de_vida.domain.promocion import Accion, Promocion, ResultadoPromocion


def a_promotion(**overrides):
    values = {
        "estudio_id": "estudio-demo",
        "proyecto_id": "proyecto-demo",
        "accion": Accion.PROMOVER,
        "de_fase": 2,
        "a_fase": 3,
        "usuario_id": "usuario-demo",
    }
    return Promocion(**{**values, **overrides})


class TestPromover:
    def test_goes_to_the_following_phase(self):
        promotion = a_promotion()

        assert (promotion.de_fase, promotion.a_fase, promotion.resultado) == (
            2,
            3,
            ResultadoPromocion.OK,
        )

    @pytest.mark.parametrize("target", [2, 4, None])
    def test_must_target_exactly_the_next_phase(self, target):
        with pytest.raises(ValueError):
            a_promotion(a_fase=target)

    def test_closing_phase_cannot_be_promoted(self):
        with pytest.raises(ValueError):
            a_promotion(de_fase=7, a_fase=8)


class TestRetener:
    def test_requires_a_reason_and_keeps_the_phase(self):
        promotion = a_promotion(accion=Accion.RETENER, a_fase=None, motivo="Falta el topográfico")

        assert (promotion.a_fase, promotion.motivo) == (None, "Falta el topográfico")

    @pytest.mark.parametrize("reason", [None, "", "  "])
    def test_rejects_a_missing_reason(self, reason):
        with pytest.raises(ValueError):
            a_promotion(accion=Accion.RETENER, a_fase=None, motivo=reason)

    def test_has_no_target_phase(self):
        with pytest.raises(ValueError):
            a_promotion(accion=Accion.RETENER, a_fase=3, motivo="x")


class TestNoPerseguir:
    def test_only_from_the_opportunity_phase(self):
        promotion = a_promotion(
            accion=Accion.NO_PERSEGUIR, de_fase=0, a_fase=None, motivo="Fuera de umbral"
        )

        assert promotion.accion is Accion.NO_PERSEGUIR

    @pytest.mark.parametrize("phase", [1, 3, 7])
    def test_rejected_from_any_other_phase(self, phase):
        with pytest.raises(ValueError):
            a_promotion(accion=Accion.NO_PERSEGUIR, de_fase=phase, a_fase=None, motivo="x")

    def test_requires_a_reason(self):
        with pytest.raises(ValueError):
            a_promotion(accion=Accion.NO_PERSEGUIR, de_fase=0, a_fase=None, motivo=None)
