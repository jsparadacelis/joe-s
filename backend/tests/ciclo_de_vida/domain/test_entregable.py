from unittest.mock import create_autospec

from backend.app.ciclo_de_vida.domain.entregable import EntregableDeSalida
from backend.app.ciclo_de_vida.domain.ports import ValidadorDeEntregable


def a_deliverable(**overrides):
    values = {
        "fase": 2,
        "contenido": {"titulo": "Brief (ejemplo)"},
        "completo": True,
        "aprobado": True,
    }
    return EntregableDeSalida(**{**values, **overrides})


class TestFaltantes:
    def test_complete_and_approved_has_nothing_missing(self):
        assert a_deliverable().faltantes() == []

    def test_reports_when_it_is_not_complete(self):
        assert a_deliverable(completo=False, aprobado=False).faltantes() == [
            "entregable de salida completo",
            "aprobación del entregable",
        ]

    def test_reports_when_it_is_complete_but_not_approved(self):
        assert a_deliverable(aprobado=False).faltantes() == ["aprobación del entregable"]

    def test_adds_what_the_phase_validator_finds(self):
        validator = create_autospec(ValidadorDeEntregable, spec_set=True, instance=True)
        validator.validar.return_value = ["referencia catastral"]
        deliverable = a_deliverable()

        missing = deliverable.faltantes(validator)

        validator.validar.assert_called_once_with({"titulo": "Brief (ejemplo)"})
        assert missing == ["referencia catastral"]
