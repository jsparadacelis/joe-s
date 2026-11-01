from backend.app.external_data.domain.errors import (
    CadastreError,
    CadastreUnavailable,
    ExternalServiceUnavailable,
)


def test_an_unavailable_elevation_or_pv_service_has_its_own_code_and_spanish_message():
    error = ExternalServiceUnavailable()

    assert error.code == "external_service_unavailable"
    assert str(error) == error.message
    assert error.message == "No se pudo consultar el servicio externo. Introduce el dato a mano."


def test_it_is_a_service_error_that_routes_answer_with_503_but_not_a_cadastre_outage():
    assert issubclass(ExternalServiceUnavailable, CadastreError)
    assert not issubclass(ExternalServiceUnavailable, CadastreUnavailable)


def test_an_unavailable_relief_has_its_own_code_and_spanish_message():
    from backend.app.external_data.domain.errors import ReliefUnavailable

    error = ReliefUnavailable()

    assert error.code == "relief_unavailable"
    assert str(error) == error.message
    assert error.message == "No se pudo obtener el relieve. Puedes seguir sin el visor 3D."
    assert issubclass(ReliefUnavailable, CadastreError)  # routes answer it with 503
    assert not issubclass(ReliefUnavailable, CadastreUnavailable)
