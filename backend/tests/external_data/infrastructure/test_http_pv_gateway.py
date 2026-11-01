"""The PVGIS gateway with a simulated httpx transport: no real calls."""

import httpx
import pytest

from backend.app.external_data.domain.errors import ExternalServiceUnavailable
from backend.app.external_data.domain.pv import PvLocation, PvYield
from backend.app.external_data.infrastructure.http_pv_gateway import (
    BASE_URL,
    HttpPvGateway,
)
from backend.tests.external_data.infrastructure.recorded import fixture

LOCATION = PvLocation(38.640, 0.039)
JSON_HEADERS = {"content-type": "application/json"}


class Service:
    def __init__(self, *answers):
        self.requests: list[httpx.Request] = []
        self.answers = list(answers) or [self.ok()]

    @staticmethod
    def ok(name="pvgis_ok.json", status=200):
        return httpx.Response(status, content=fixture(name), headers=JSON_HEADERS)

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        answer = self.answers.pop(0) if len(self.answers) > 1 else self.answers[0]
        if isinstance(answer, Exception):
            raise answer
        return answer


def gateway(service: Service) -> HttpPvGateway:
    return HttpPvGateway(transport=httpx.MockTransport(service))


def test_one_get_of_pvcalc_with_the_reference_system_and_optimal_angles():
    service = Service()

    result = gateway(service).fetch(LOCATION)

    (request,) = service.requests
    assert request.method == "GET"
    assert str(request.url).startswith(BASE_URL)
    assert dict(request.url.params) == {
        "lat": "38.64",
        "lon": "0.039",
        "peakpower": "1",
        "loss": "14",
        "optimalangles": "1",
        "outputformat": "json",
    }
    assert result == PvYield(LOCATION, 1617.61, 35.0, -3.0)


def test_the_base_url_is_the_public_pvgis_pvcalc_endpoint():
    assert BASE_URL == "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc"


def test_a_400_is_unavailable_and_is_not_retried():
    service = Service(Service.ok("pvgis_bad_request.json", status=400))

    with pytest.raises(ExternalServiceUnavailable):
        gateway(service).fetch(LOCATION)

    assert len(service.requests) == 1


def test_a_5xx_is_retried_once_and_a_good_second_answer_is_used():
    service = Service(httpx.Response(503), Service.ok())

    assert gateway(service).fetch(LOCATION).annual_kwh_per_kwp == 1617.61
    assert len(service.requests) == 2


def test_two_5xx_answers_are_unavailable():
    service = Service(httpx.Response(500), httpx.Response(502))

    with pytest.raises(ExternalServiceUnavailable):
        gateway(service).fetch(LOCATION)

    assert len(service.requests) == 2


@pytest.mark.parametrize("error", [httpx.ConnectTimeout("slow"), httpx.ConnectError("down")])
def test_network_errors_and_timeouts_are_retried_then_unavailable(error):
    service = Service(error)

    with pytest.raises(ExternalServiceUnavailable):
        gateway(service).fetch(LOCATION)

    assert len(service.requests) == 2


def test_a_200_whose_body_is_an_error_message_is_unavailable():
    service = Service(Service.ok("pvgis_bad_request.json", status=200))

    with pytest.raises(ExternalServiceUnavailable):
        gateway(service).fetch(LOCATION)


def test_invalid_json_with_status_200_is_unavailable():
    service = Service(httpx.Response(200, content=b"<html>maintenance"))

    with pytest.raises(ExternalServiceUnavailable):
        gateway(service).fetch(LOCATION)


def test_the_client_timeout_is_ten_seconds():
    assert gateway(Service())._client.timeout == httpx.Timeout(10.0)
