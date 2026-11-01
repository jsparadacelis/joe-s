"""The HTTP gateway with a simulated httpx transport: no real calls."""

import json

import httpx
import pytest

from backend.app.external_data.domain.cadastral_property import PropertyClass
from backend.app.external_data.domain.errors import CadastreNotFound, CadastreUnavailable
from backend.app.external_data.infrastructure.http_cadastre_gateway import (
    BASE_URL,
    HttpCadastreGateway,
)
from backend.tests.external_data.domain.test_cadastral_property import REFERENCE
from backend.tests.external_data.infrastructure.recorded import fixture, with_holder_fields

XML = {"content-type": "text/xml; charset=utf-8"}


class Service:
    """Records the requests and answers with a script per endpoint."""

    def __init__(self, dnprc=None, cpmrc=None):
        self.requests: list[httpx.Request] = []
        self.dnprc = list(dnprc if dnprc is not None else [self.ok("dnprc_ok.xml")])
        self.cpmrc = list(cpmrc if cpmrc is not None else [self.ok("cpmrc_ok.xml")])

    @staticmethod
    def ok(name, status=200):
        return httpx.Response(status, content=fixture(name), headers=XML)

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        script = self.dnprc if "Consulta_DNPRC" in request.url.path else self.cpmrc
        answer = script.pop(0) if len(script) > 1 else script[0]
        if isinstance(answer, Exception):
            raise answer
        return answer

    def paths(self):
        return [r.url.path.rsplit("/", 1)[-1] for r in self.requests]


def gateway(service: Service) -> HttpCadastreGateway:
    return HttpCadastreGateway(transport=httpx.MockTransport(service))


def test_two_calls_with_the_right_parameters_build_the_complete_property():
    service = Service()

    result = gateway(service).fetch(REFERENCE)

    assert service.paths() == ["Consulta_DNPRC", "Consulta_CPMRC"]
    dnprc, cpmrc = service.requests
    assert str(dnprc.url).startswith(BASE_URL)
    assert dnprc.method == "GET" and cpmrc.method == "GET"
    assert dict(dnprc.url.params) == {"Provincia": "", "Municipio": "", "RC": REFERENCE}
    assert dict(cpmrc.url.params) == {
        "Provincia": "",
        "Municipio": "",
        "SRS": "EPSG:4326",
        "RC": REFERENCE[:14],
    }
    assert result.reference == REFERENCE
    assert result.property_class is PropertyClass.URBAN
    assert (result.latitude, result.longitude) == (38.5, -3.5)
    assert len(result.units) == 3


def test_the_client_has_a_ten_second_timeout():
    client = HttpCadastreGateway(transport=httpx.MockTransport(Service()))._client

    assert client.timeout == httpx.Timeout(10.0)


def test_a_malformed_reference_is_not_found_in_a_200_answer_and_coordinates_are_not_asked():
    service = Service(dnprc=[Service.ok("dnprc_malformed.xml")])

    with pytest.raises(CadastreNotFound):
        gateway(service).fetch(REFERENCE)

    assert service.paths() == ["Consulta_DNPRC"]


def test_an_unknown_error_inside_a_200_answer_is_unavailable():
    service = Service(dnprc=[Service.ok("dnprc_service_error.xml")])

    with pytest.raises(CadastreUnavailable):
        gateway(service).fetch(REFERENCE)


def test_a_failing_coordinates_service_makes_the_whole_query_unavailable():
    service = Service(cpmrc=[Service.ok("cpmrc_not_found.xml")])

    with pytest.raises(CadastreUnavailable):
        gateway(service).fetch(REFERENCE)


@pytest.mark.parametrize(
    "failure",
    [httpx.ConnectError("down"), httpx.ReadTimeout("slow"), httpx.Response(503, content=b"x")],
)
def test_one_retry_recovers_from_a_network_error_or_a_5xx(failure):
    service = Service(dnprc=[failure, Service.ok("dnprc_ok.xml")])

    result = gateway(service).fetch(REFERENCE)

    assert service.paths() == ["Consulta_DNPRC", "Consulta_DNPRC", "Consulta_CPMRC"]
    assert result.reference == REFERENCE


@pytest.mark.parametrize(
    "failure",
    [httpx.ConnectError("down"), httpx.ReadTimeout("slow"), httpx.Response(500, content=b"x")],
)
def test_two_failures_in_a_row_are_unavailable_after_exactly_one_retry(failure):
    service = Service(dnprc=[failure])

    with pytest.raises(CadastreUnavailable):
        gateway(service).fetch(REFERENCE)

    assert service.paths() == ["Consulta_DNPRC", "Consulta_DNPRC"]


def test_the_coordinates_call_is_also_retried_once():
    service = Service(cpmrc=[httpx.ReadTimeout("slow"), Service.ok("cpmrc_ok.xml")])

    gateway(service).fetch(REFERENCE)

    assert service.paths().count("Consulta_CPMRC") == 2


@pytest.mark.parametrize("status", [400, 403, 404])
def test_a_4xx_is_unavailable_and_not_retried(status):
    service = Service(dnprc=[httpx.Response(status, content=b"nope")])

    with pytest.raises(CadastreUnavailable):
        gateway(service).fetch(REFERENCE)

    assert service.paths() == ["Consulta_DNPRC"]


@pytest.mark.parametrize("body", [b"<html>maintenance</html>", b"", b"\x00\x01"])
def test_an_invalid_xml_body_is_unavailable(body):
    service = Service(dnprc=[httpx.Response(200, content=body)])

    with pytest.raises(CadastreUnavailable):
        gateway(service).fetch(REFERENCE)


def test_holder_fields_in_the_answer_do_not_reach_the_model():
    injected = httpx.Response(200, content=with_holder_fields(fixture("dnprc_ok.xml")))
    service = Service(dnprc=[injected])

    result = gateway(service).fetch(REFERENCE)

    dumped = json.dumps(result.to_dict())
    assert "HOLDER" not in dumped and "00000000T" not in dumped
    assert result == gateway(Service()).fetch(REFERENCE)
