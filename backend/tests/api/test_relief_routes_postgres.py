"""The relief route against real Postgres with simulated gateways: study caches, statuses, and
no pool connection held while the elevation service answers."""

import threading
from datetime import datetime, timezone
from unittest.mock import create_autospec

import httpx
import psycopg
import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import get_settings, plot_gateway, relief_gateway
from backend.app.api.main import create_app
from backend.app.external_data.domain.errors import ReliefUnavailable
from backend.app.external_data.domain.ports import PlotGateway, ReliefGateway
from backend.app.external_data.domain.relief import (
    ElevationGrid,
    Relief,
    ReliefOptions,
    plan_relief_window,
)
from backend.app.external_data.infrastructure.http_relief_gateway import HttpReliefGateway
from backend.app.external_data.infrastructure.plot_parser import parse_plot
from backend.app.external_data.infrastructure.postgres_relief_cache import PostgresReliefCache
from backend.app.shared.config import Settings
from backend.app.shared.db import close_pools, open_pool, study_transaction
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.app.study.domain.context import RequestContext, Role
from backend.tests.external_data.domain.test_plot import (
    PROPERTY_REFERENCE,
    REFERENCE,
    TRIANGLE,
    _plot_from_metres,
)
from backend.tests.external_data.infrastructure.recorded import fixture

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
RELIEF = f"/api/cadastre/{PROPERTY_REFERENCE}/relief"


def grid_for(window):
    cols, rows = window.grid_size
    return ElevationGrid(cols, rows, tuple(float(i % 11) for i in range(cols * rows)))


@pytest.fixture
def url(schema_url):
    url, _ = schema_url
    apply_migrations(url, MIGRATIONS_DIR)
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(
            "INSERT INTO studies (id, name) VALUES (%s, 'A (sample)'), (%s, 'B (sample)')",
            (STUDY_A, STUDY_B),
        )
    return url


@pytest.fixture
def gateways():
    plots = create_autospec(PlotGateway, spec_set=True, instance=True)
    plots.fetch.return_value = _plot_from_metres(TRIANGLE)
    reliefs = create_autospec(ReliefGateway, spec_set=True, instance=True)
    reliefs.fetch.side_effect = grid_for
    return plots, reliefs


def make_client(url, plots, reliefs, study_id=STUDY_A):
    settings = Settings(_env_file=None, database_url=url, dev_study_id=study_id)
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[plot_gateway] = lambda: plots
    app.dependency_overrides[relief_gateway] = lambda: reliefs
    return TestClient(app)


@pytest.fixture
def client_for(url, gateways):
    return lambda study_id=STUDY_A: make_client(url, *gateways, study_id)


def test_the_second_request_is_served_from_the_study_cache(client_for, gateways):
    plots, reliefs = gateways
    client = client_for()

    first = client.get(RELIEF)
    second = client.get(f"/api/cadastre/{REFERENCE}0002AB/relief")  # another unit, same plot

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert first.json()["reference"] == REFERENCE
    assert reliefs.fetch.call_count == 1
    assert plots.fetch.call_count == 1


def test_other_options_ask_the_service_again_but_reuse_the_cached_plot(client_for, gateways):
    plots, reliefs = gateways
    client = client_for()

    small = client.get(RELIEF, params={"margin": 0, "max_side": 100})
    default = client.get(RELIEF)
    again = client.get(RELIEF, params={"margin": 0, "max_side": 100})

    assert [r.status_code for r in (small, default, again)] == [200, 200, 200]
    assert small.json() == again.json()
    assert small.json()["window"] != default.json()["window"]
    assert reliefs.fetch.call_count == 2
    assert plots.fetch.call_count == 1


def test_another_study_does_not_use_the_cache_of_the_first(client_for, gateways):
    _, reliefs = gateways

    client_for(STUDY_A).get(RELIEF)
    client_for(STUDY_B).get(RELIEF)

    assert reliefs.fetch.call_count == 2


def test_an_unavailable_service_is_503_and_nothing_is_cached(client_for, gateways):
    _, reliefs = gateways
    client = client_for()
    reliefs.fetch.side_effect = ReliefUnavailable()

    response = client.get(RELIEF)

    assert response.status_code == 503
    assert response.json()["detail"] == {
        "code": "relief_unavailable",
        "message": "No se pudo obtener el relieve. Puedes seguir sin el visor 3D.",
    }
    reliefs.fetch.side_effect = grid_for
    assert client.get(RELIEF).status_code == 200


@pytest.mark.parametrize(
    ("path", "params", "code"),
    [
        (f"/api/cadastre/{REFERENCE}/relief", {}, "plot_reference_only"),
        ("/api/cadastre/ABC/relief", {}, "invalid_cadastral_reference"),
        (RELIEF, {"margin": 7}, "invalid_relief_margin"),
        (RELIEF, {"max_side": 7}, "invalid_relief_max_side"),
    ],
)
def test_invalid_input_is_422_and_no_service_is_called(client_for, gateways, path, params, code):
    response = client_for().get(path, params=params)

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == code
    assert all(not gateway.fetch.called for gateway in gateways)


def test_the_whole_chain_asks_the_wcs_for_the_window_of_the_recorded_plot(url):
    """Recorded INSPIRE plot -> window -> WCS request -> recorded ArcGrid -> JSON."""
    plots = create_autospec(PlotGateway, spec_set=True, instance=True)
    plots.fetch.return_value = parse_plot(REFERENCE, fixture("wfs_parcel_ok.xml"))
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, content=fixture("wcs_arcgrid_ok.asc"))

    wcs = HttpReliefGateway(transport=httpx.MockTransport(handler))

    response = make_client(url, plots, wcs).get(RELIEF)

    assert response.status_code == 200
    (request,) = requests
    assert dict(request.url.params)["BBOX"] == "0.03866314,38.63959584,0.04014612,38.64081273"
    assert (dict(request.url.params)["WIDTH"], dict(request.url.params)["HEIGHT"]) == ("25", "27")
    body = response.json()
    assert body["window"]["width_m"] == 125.0
    assert body["grid"]["values"][0] == 36.752
    assert (body["grid"]["min_m"], body["grid"]["max_m"]) == (18.222, 54.039)
    assert (body["clipped"], body["parcel_clipped"]) == (False, False)
    assert body["outline"]["type"] == "Polygon"
    assert body["plot_area_m2"] == pytest.approx(2905.99)


def test_a_slow_elevation_service_does_not_hold_a_pool_connection(url, gateways):
    """Pool of one connection: while the gateway waits, another request still completes."""
    plots, reliefs = gateways
    entered = threading.Event()
    release = threading.Event()

    def slow_fetch(window):
        entered.set()
        assert release.wait(timeout=20)
        return grid_for(window)

    reliefs.fetch.side_effect = slow_fetch
    other = "1234567VH1234S"
    open_pool(url, min_size=1, max_size=1)
    try:
        client = make_client(url, plots, reliefs)
        # A cached entry for another plot: serving it needs the database.
        cached = client_cached_relief(url, other)
        results = []
        worker = threading.Thread(target=lambda: results.append(client.get(RELIEF)))
        worker.start()
        assert entered.wait(timeout=10)

        probe = threading.Thread(
            target=lambda: results.append(client.get(f"/api/cadastre/{other}0001AA/relief"))
        )
        probe.start()
        probe.join(timeout=5)
        finished_while_waiting = not probe.is_alive()
        release.set()
        worker.join(timeout=20)
        probe.join(timeout=5)
    finally:
        release.set()
        close_pools()

    assert finished_while_waiting
    assert sorted(r.status_code for r in results) == [200, 200]
    assert cached.reference == other


def client_cached_relief(url, reference):
    """Store a relief for `reference` in study A's cache, as a previous request would have."""

    plot = _plot_from_metres(TRIANGLE)
    options = ReliefOptions()
    plan = plan_relief_window(plot, options)
    relief = Relief(
        reference,
        plan.window,
        grid_for(plan.window),
        plan.outline,
        plan.clipped,
        plan.parcel_clipped,
        plot.computed_area_m2,
    )
    context = RequestContext(study_id=STUDY_A, user_id="demo-user", role=Role.PARTNER)
    with study_transaction(url, context) as conn:
        PostgresReliefCache(conn).put(relief, options, datetime.now(timezone.utc))
    return relief
