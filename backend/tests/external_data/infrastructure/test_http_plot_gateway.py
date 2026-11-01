"""The WFS gateway with a simulated httpx transport: no real calls."""

import httpx
import pytest

from backend.app.external_data.domain.errors import CadastreUnavailable, PlotNotFound
from backend.app.external_data.infrastructure.http_plot_gateway import BASE_URL, HttpPlotGateway
from backend.tests.external_data.infrastructure.recorded import fixture

PLOT = "4714805BC6841S"
XML = {"content-type": "text/xml; charset=ISO-8859-1"}


class Service:
    def __init__(self, *answers):
        self.requests: list[httpx.Request] = []
        self.answers = list(answers) or [self.ok()]

    @staticmethod
    def ok(name="wfs_parcel_ok.xml", status=200):
        return httpx.Response(status, content=fixture(name), headers=XML)

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        answer = self.answers.pop(0) if len(self.answers) > 1 else self.answers[0]
        if isinstance(answer, Exception):
            raise answer
        return answer


def gateway(service: Service) -> HttpPlotGateway:
    return HttpPlotGateway(transport=httpx.MockTransport(service))


def test_one_get_with_the_stored_query_and_always_epsg_4326():
    service = Service()

    plot = gateway(service).fetch(PLOT)

    (request,) = service.requests
    assert request.method == "GET"
    assert str(request.url).startswith(BASE_URL)
    assert dict(request.url.params) == {
        "service": "wfs",
        "version": "2",
        "request": "getfeature",
        "STOREDQUERY_ID": "GetParcel",
        "refcat": PLOT,
        "srsname": "EPSG::4326",
    }
    assert plot.reference == PLOT
    assert plot.cadastral_area_m2 == 2908


def test_the_base_url_is_the_public_inspire_wfs_for_cadastral_parcels():
    assert BASE_URL == "http://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx"


def test_an_exception_report_with_status_200_is_not_found_and_is_not_retried():
    service = Service(Service.ok("wfs_parcel_not_found.xml"))

    with pytest.raises(PlotNotFound):
        gateway(service).fetch(PLOT)

    assert len(service.requests) == 1


def test_a_5xx_is_retried_once_and_a_good_second_answer_is_used():
    service = Service(httpx.Response(503), Service.ok())

    assert gateway(service).fetch(PLOT).cadastral_area_m2 == 2908
    assert len(service.requests) == 2


def test_two_5xx_answers_are_unavailable():
    service = Service(httpx.Response(500), httpx.Response(502))

    with pytest.raises(CadastreUnavailable):
        gateway(service).fetch(PLOT)

    assert len(service.requests) == 2


@pytest.mark.parametrize("error", [httpx.ConnectTimeout("slow"), httpx.ConnectError("down")])
def test_network_errors_and_timeouts_are_retried_then_unavailable(error):
    service = Service(error)

    with pytest.raises(CadastreUnavailable):
        gateway(service).fetch(PLOT)

    assert len(service.requests) == 2


def test_a_timeout_followed_by_a_good_answer_succeeds():
    service = Service(httpx.ReadTimeout("slow"), Service.ok())

    assert gateway(service).fetch(PLOT).reference == PLOT


@pytest.mark.parametrize("status", [400, 403, 404])
def test_a_client_error_is_unavailable_without_retry(status):
    service = Service(httpx.Response(status))

    with pytest.raises(CadastreUnavailable):
        gateway(service).fetch(PLOT)

    assert len(service.requests) == 1


def test_invalid_xml_is_unavailable():
    service = Service(httpx.Response(200, content=b"<html>maintenance"))

    with pytest.raises(CadastreUnavailable):
        gateway(service).fetch(PLOT)


def test_the_client_timeout_is_ten_seconds():
    assert gateway(Service())._client.timeout == httpx.Timeout(10.0)
