"""The IDEE WCS relief gateway with a simulated httpx transport: no real calls."""

import httpx
import pytest

from backend.app.external_data.domain.errors import ReliefUnavailable
from backend.app.external_data.domain.relief import ReliefWindow
from backend.app.external_data.infrastructure.http_relief_gateway import (
    BASE_URL,
    COVERAGE,
    HttpReliefGateway,
)
from backend.tests.external_data.infrastructure.recorded import fixture

# The window of the test plot with margin 25 and side 300: 125.00 x 131.18 m, so 25 x 27 cells.
WINDOW = ReliefWindow(0.03866314, 38.63959584, 0.04014612, 38.64081273, 125.0, 131.18)
ASC_HEADERS = {"content-type": "application/asc"}


class Service:
    def __init__(self, *answers):
        self.requests: list[httpx.Request] = []
        self.answers = list(answers) or [self.ok()]

    @staticmethod
    def ok(name="wcs_arcgrid_ok.asc", status=200):
        return httpx.Response(status, content=fixture(name), headers=ASC_HEADERS)

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        answer = self.answers.pop(0) if len(self.answers) > 1 else self.answers[0]
        if isinstance(answer, Exception):
            raise answer
        return answer


def gateway(service: Service) -> HttpReliefGateway:
    return HttpReliefGateway(transport=httpx.MockTransport(service))


def test_one_get_coverage_request_for_the_window_in_degrees():
    service = Service()

    grid = gateway(service).fetch(WINDOW)

    (request,) = service.requests
    assert request.method == "GET"
    # httpx writes the empty path as "/": the service answers the same (checked live).
    assert str(request.url).startswith(BASE_URL + "/?")
    assert dict(request.url.params) == {
        "SERVICE": "WCS",
        "VERSION": "1.0.0",
        "REQUEST": "GetCoverage",
        "COVERAGE": "Elevacion4258_5",
        "CRS": "EPSG:4258",
        "BBOX": "0.03866314,38.63959584,0.04014612,38.64081273",
        "WIDTH": "25",
        "HEIGHT": "27",
        "FORMAT": "ArcGrid",
    }
    assert (grid.ncols, grid.nrows) == (25, 27)
    assert grid.values[0] == 36.752


def test_the_service_url_and_the_coverage_are_the_public_5_m_mdt_of_the_idee():
    assert BASE_URL == "https://servicios.idee.es/wcs-inspire/mdt"
    assert COVERAGE == "Elevacion4258_5"


def test_the_bbox_never_uses_scientific_notation():
    window = ReliefWindow(0.00000012, 38.5, 0.00000112, 38.5001, 50.0, 10.0)
    service = Service(httpx.Response(200, content=b"x"))

    with pytest.raises(ReliefUnavailable):
        gateway(service).fetch(window)

    assert (
        dict(service.requests[0].url.params)["BBOX"]
        == "0.00000012,38.50000000,0.00000112,38.50010000"
    )


def test_a_service_exception_report_with_status_200_is_unavailable_and_not_retried():
    service = Service(Service.ok("wcs_service_exception.xml"))

    with pytest.raises(ReliefUnavailable):
        gateway(service).fetch(WINDOW)

    assert len(service.requests) == 1


def test_a_5xx_is_retried_once_and_a_good_second_answer_is_used():
    service = Service(httpx.Response(503), Service.ok())

    assert gateway(service).fetch(WINDOW).values[0] == 36.752
    assert len(service.requests) == 2


def test_two_5xx_answers_are_unavailable():
    service = Service(httpx.Response(500), httpx.Response(502))

    with pytest.raises(ReliefUnavailable):
        gateway(service).fetch(WINDOW)

    assert len(service.requests) == 2


@pytest.mark.parametrize(
    "error", [httpx.ConnectTimeout("slow"), httpx.ReadTimeout("slow"), httpx.ConnectError("down")]
)
def test_network_errors_and_timeouts_are_retried_then_unavailable(error):
    service = Service(error)

    with pytest.raises(ReliefUnavailable):
        gateway(service).fetch(WINDOW)

    assert len(service.requests) == 2


def test_a_timeout_followed_by_a_good_answer_succeeds():
    service = Service(httpx.ReadTimeout("slow"), Service.ok())

    assert gateway(service).fetch(WINDOW).ncols == 25


@pytest.mark.parametrize("status", [400, 404, 429])
def test_a_4xx_is_unavailable_without_retry(status):
    service = Service(httpx.Response(status))

    with pytest.raises(ReliefUnavailable):
        gateway(service).fetch(WINDOW)

    assert len(service.requests) == 1


@pytest.mark.parametrize("body", [b"", b"<html>maintenance</html>", b"ncols 25\nnrows 27\n1 2 3\n"])
def test_a_garbled_answer_with_status_200_is_unavailable(body):
    with pytest.raises(ReliefUnavailable):
        gateway(Service(httpx.Response(200, content=body))).fetch(WINDOW)


def test_a_grid_of_another_size_than_the_one_asked_is_unavailable():
    window = ReliefWindow(0.0386, 38.6395, 0.0402, 38.6408, 100.0, 100.0)  # asks for 20 x 20

    with pytest.raises(ReliefUnavailable):
        gateway(Service()).fetch(window)  # the recorded answer is 25 x 27


def test_the_client_timeout_is_fifteen_seconds():
    assert gateway(Service())._client.timeout == httpx.Timeout(15.0)
