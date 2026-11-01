"""The terrain and PV routes against real Postgres with simulated gateways: study caches,
statuses, and no pool connection held while a service answers."""

import threading
from unittest.mock import create_autospec

import psycopg
import pytest
from fastapi.testclient import TestClient

from backend.app.api.dependencies import (
    elevation_gateway,
    get_settings,
    plot_gateway,
    pv_gateway,
)
from backend.app.api.main import create_app
from backend.app.external_data.domain.errors import ExternalServiceUnavailable
from backend.app.external_data.domain.ports import ElevationGateway, PlotGateway, PvGateway
from backend.app.external_data.domain.pv import PvYield
from backend.app.external_data.domain.terrain import TerrainProfile
from backend.app.shared.config import Settings
from backend.app.shared.db import close_pools, open_pool
from backend.app.shared.migrate import MIGRATIONS_DIR, apply_migrations
from backend.tests.external_data.domain.test_plot import (
    PROPERTY_REFERENCE,
    REFERENCE,
    TRIANGLE,
    _plot_from_metres,
)

pytestmark = pytest.mark.integration

STUDY_A = "11111111-1111-1111-1111-111111111111"
STUDY_B = "22222222-2222-2222-2222-222222222222"
TERRAIN = f"/api/cadastre/{PROPERTY_REFERENCE}/terrain"
PV = f"/api/cadastre/{PROPERTY_REFERENCE}/pv"


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
    elevations = create_autospec(ElevationGateway, spec_set=True, instance=True)
    elevations.fetch.return_value = [100.0, 103.0, 95.0]
    pv = create_autospec(PvGateway, spec_set=True, instance=True)
    pv.fetch.side_effect = lambda location: PvYield(location, 1617.61, 35.0, -3.0)
    return plots, elevations, pv


def make_client(url, gateways, study_id=STUDY_A):
    plots, elevations, pv = gateways
    settings = Settings(_env_file=None, database_url=url, dev_study_id=study_id)
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[plot_gateway] = lambda: plots
    app.dependency_overrides[elevation_gateway] = lambda: elevations
    app.dependency_overrides[pv_gateway] = lambda: pv
    return TestClient(app)


@pytest.fixture
def client_for(url, gateways):
    return lambda study_id=STUDY_A: make_client(url, gateways, study_id)


def test_terrain_second_request_is_served_from_the_study_cache(client_for, gateways):
    plots, elevations, _ = gateways
    client = client_for()

    first = client.get(TERRAIN)
    second = client.get(f"/api/cadastre/{REFERENCE}0002AB/terrain")  # another unit, same plot

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json() == TerrainProfile(REFERENCE, 100.0, 10.0).to_dict()
    assert elevations.fetch.call_count == 1
    assert plots.fetch.call_count == 1


def test_pv_second_request_is_served_from_the_study_cache(client_for, gateways):
    _, _, pv = gateways
    client = client_for()

    first = client.get(PV)
    second = client.get(f"/api/cadastre/{REFERENCE}0002AB/pv")

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert first.json()["annual_kwh_per_kwp"] == 1617.61
    assert pv.fetch.call_count == 1


def test_another_study_does_not_use_the_cache_of_the_first(client_for, gateways):
    _, elevations, pv = gateways
    client_for(STUDY_A).get(TERRAIN)
    client_for(STUDY_B).get(TERRAIN)
    client_for(STUDY_A).get(PV)
    client_for(STUDY_B).get(PV)

    assert elevations.fetch.call_count == 2
    assert pv.fetch.call_count == 2


def test_unavailable_services_are_503_and_not_cached(client_for, gateways):
    _, elevations, pv = gateways
    client = client_for()
    elevations.fetch.side_effect = ExternalServiceUnavailable()
    pv.fetch.side_effect = ExternalServiceUnavailable()

    for path in (TERRAIN, PV):
        response = client.get(path)
        assert response.status_code == 503
        assert response.json()["detail"]["code"] == "external_service_unavailable"

    elevations.fetch.side_effect = None
    pv.fetch.side_effect = lambda location: PvYield(location, 1500.0)
    assert client.get(TERRAIN).status_code == 200
    assert client.get(PV).status_code == 200


@pytest.mark.parametrize("kind", ["terrain", "pv"])
@pytest.mark.parametrize(
    ("suffix", "code"),
    [
        (REFERENCE, "plot_reference_only"),
        ("ABC", "invalid_cadastral_reference"),
        ("%20", "cadastral_reference_required"),
    ],
)
def test_an_invalid_reference_is_422_and_no_service_is_called(
    client_for, gateways, kind, suffix, code
):
    response = client_for().get(f"/api/cadastre/{suffix}/{kind}")

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == code
    assert all(not gateway.fetch.called for gateway in gateways)


def test_a_slow_elevation_service_does_not_hold_a_pool_connection(url, gateways):
    """Pool of one connection: while the gateway waits, another request still completes."""
    plots, elevations, pv = gateways
    entered = threading.Event()
    release = threading.Event()

    def slow_fetch(positions):
        entered.set()
        assert release.wait(timeout=20)
        return [100.0, 103.0, 95.0]

    elevations.fetch.side_effect = slow_fetch
    other = "1234567VH1234S"
    with psycopg.connect(url, autocommit=True) as admin:  # a cached entry: needs the database
        from psycopg.types.json import Jsonb

        admin.execute(
            "INSERT INTO terrain_cache (study_id, reference, payload) VALUES (%s, %s, %s)",
            (STUDY_A, other, Jsonb(TerrainProfile(other, 5.0, 1.0).to_dict())),
        )
    open_pool(url, min_size=1, max_size=1)
    try:
        client = make_client(url, gateways)
        results = []
        worker = threading.Thread(target=lambda: results.append(client.get(TERRAIN)))
        worker.start()
        assert entered.wait(timeout=10)

        probe = threading.Thread(
            target=lambda: results.append(client.get(f"/api/cadastre/{other}0001AA/terrain"))
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


def test_a_slow_pvgis_does_not_hold_a_pool_connection(url, gateways):
    _, _, pv = gateways
    entered = threading.Event()
    release = threading.Event()

    def slow_fetch(location):
        entered.set()
        assert release.wait(timeout=20)
        return PvYield(location, 1600.0)

    pv.fetch.side_effect = slow_fetch
    open_pool(url, min_size=1, max_size=1)
    try:
        client = make_client(url, gateways)
        results = []
        worker = threading.Thread(target=lambda: results.append(client.get(PV)))
        worker.start()
        assert entered.wait(timeout=10)

        # The terrain route needs the database too (its cache), and completes meanwhile.
        probe = threading.Thread(target=lambda: results.append(client.get(TERRAIN)))
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
