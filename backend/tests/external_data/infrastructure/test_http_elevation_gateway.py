"""The Open-Meteo elevation gateway with a simulated httpx transport: no real calls."""

import json

import httpx
import pytest

from backend.app.external_data.domain.errors import ExternalServiceUnavailable
from backend.app.external_data.infrastructure.http_elevation_gateway import (
    BASE_URL,
    MAX_POSITIONS_PER_REQUEST,
    HttpElevationGateway,
)
from backend.tests.external_data.infrastructure.recorded import fixture

POSITIONS = [(0.03943209, 38.64023416), (0.039617, 38.639844), (0.038965, 38.64042)]
JSON_HEADERS = {"content-type": "application/json; charset=utf-8"}


class Service:
    def __init__(self, *answers):
        self.requests: list[httpx.Request] = []
        self.answers = list(answers) or [self.ok()]

    @staticmethod
    def ok(name="open_meteo_ok.json", status=200):
        return httpx.Response(status, content=fixture(name), headers=JSON_HEADERS)

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        answer = self.answers.pop(0) if len(self.answers) > 1 else self.answers[0]
        if isinstance(answer, Exception):
            raise answer
        return answer


def gateway(service: Service) -> HttpElevationGateway:
    return HttpElevationGateway(transport=httpx.MockTransport(service))


def test_one_get_with_comma_separated_latitudes_then_longitudes_in_order():
    service = Service()

    elevations = gateway(service).fetch(POSITIONS)

    (request,) = service.requests
    assert request.method == "GET"
    assert str(request.url).startswith(BASE_URL)
    assert dict(request.url.params) == {
        "latitude": "38.64023416,38.639844,38.64042",
        "longitude": "0.03943209,0.039617,0.038965",
    }
    assert elevations == [45.0, 29.0, 33.0]


def test_the_base_url_is_the_public_open_meteo_elevation_api():
    assert BASE_URL == "https://api.open-meteo.com/v1/elevation"
    assert MAX_POSITIONS_PER_REQUEST == 100


def test_no_positions_means_no_request():
    service = Service()

    assert gateway(service).fetch([]) == []
    assert service.requests == []


def test_more_than_one_hundred_positions_go_in_batches_and_keep_their_order():
    sent: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        latitudes = request.url.params["latitude"].split(",")
        sent.append(len(latitudes))
        return httpx.Response(200, json={"elevation": [float(lat) for lat in latitudes]})

    positions = [(0.0, 38.0 + i / 1000) for i in range(250)]

    elevations = HttpElevationGateway(transport=httpx.MockTransport(handler)).fetch(positions)

    assert sent == [100, 100, 50]
    assert elevations == [lat for _, lat in positions]


def test_a_failing_batch_fails_the_whole_query():
    answers = iter(
        [
            httpx.Response(200, json={"elevation": [0.0] * 100}),
            httpx.Response(503),
            httpx.Response(503),
        ]
    )

    def handler(request):
        return next(answers)

    positions = [(0.0, 38.0 + i / 1000) for i in range(150)]

    with pytest.raises(ExternalServiceUnavailable):
        HttpElevationGateway(transport=httpx.MockTransport(handler)).fetch(positions)


def test_a_400_with_error_true_is_unavailable_and_is_not_retried():
    service = Service(
        httpx.Response(400, content=fixture("open_meteo_error.json"), headers=JSON_HEADERS)
    )

    with pytest.raises(ExternalServiceUnavailable):
        gateway(service).fetch(POSITIONS)

    assert len(service.requests) == 1


def test_a_5xx_is_retried_once_and_a_good_second_answer_is_used():
    service = Service(httpx.Response(503), Service.ok())

    assert gateway(service).fetch(POSITIONS) == [45.0, 29.0, 33.0]
    assert len(service.requests) == 2


def test_two_5xx_answers_are_unavailable():
    service = Service(httpx.Response(500), httpx.Response(502))

    with pytest.raises(ExternalServiceUnavailable):
        gateway(service).fetch(POSITIONS)

    assert len(service.requests) == 2


@pytest.mark.parametrize("error", [httpx.ConnectTimeout("slow"), httpx.ConnectError("down")])
def test_network_errors_and_timeouts_are_retried_then_unavailable(error):
    service = Service(error)

    with pytest.raises(ExternalServiceUnavailable):
        gateway(service).fetch(POSITIONS)

    assert len(service.requests) == 2


def test_a_429_rate_limit_is_unavailable_without_retry():
    service = Service(httpx.Response(429))

    with pytest.raises(ExternalServiceUnavailable):
        gateway(service).fetch(POSITIONS)

    assert len(service.requests) == 1


def test_invalid_json_with_status_200_is_unavailable():
    service = Service(httpx.Response(200, content=b"<html>maintenance"))

    with pytest.raises(ExternalServiceUnavailable):
        gateway(service).fetch(POSITIONS)


def test_an_answer_with_the_wrong_number_of_elevations_is_unavailable():
    service = Service(httpx.Response(200, content=json.dumps({"elevation": [1.0]}).encode()))

    with pytest.raises(ExternalServiceUnavailable):
        gateway(service).fetch(POSITIONS)


def test_the_client_timeout_is_ten_seconds():
    assert gateway(Service())._client.timeout == httpx.Timeout(10.0)
