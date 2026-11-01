"""'Query again': authority first, then the Catastro, then one short write; a failure writes nothing."""

from contextlib import contextmanager
from unittest.mock import Mock, create_autospec

import pytest

from backend.app.access.domain.project_roles import ProjectRole
from backend.app.external_data.application.get_cadastral_property import GetCadastralProperty
from backend.app.external_data.application.get_plot_geometry import GetPlotGeometry
from backend.app.external_data.application.get_pv_yield import GetPvYield
from backend.app.external_data.application.get_terrain_profile import (
    GetTerrainProfile,
)
from backend.app.external_data.domain.cadastral_reference import InvalidCadastralReference
from backend.app.external_data.domain.errors import (
    CadastreNotFound,
    CadastreUnavailable,
    ExternalServiceUnavailable,
    PlotNotFound,
)
from backend.app.external_data.domain.pv import PvLocation, PvYield
from backend.app.external_data.domain.terrain import TerrainProfile
from backend.app.lifecycle.domain.errors import NoAuthority
from backend.app.technical_data.application.common import TechnicalDataResult
from backend.app.technical_data.application.refresh_technical_data import (
    RefreshSession,
    RefreshTechnicalData,
)
from backend.app.technical_data.domain.catalog import Source
from backend.app.technical_data.domain.datum import TechnicalDatum
from backend.app.technical_data.domain.errors import ProjectNotFound, TechnicalDataNotEditable
from backend.tests.external_data.domain.test_cadastral_property import REFERENCE, a_property
from backend.tests.external_data.domain.test_plot import (
    TRIANGLE,
    _plot_from_metres,
)
from backend.tests.technical_data.application.support import (
    NOW,
    a_context,
    a_project,
    a_row,
    a_sheet,
    ok_events,
    rejected_events,
)


@pytest.fixture
def get_property():
    stub = create_autospec(GetCadastralProperty, spec_set=True, instance=True)
    stub.execute.return_value = a_property()
    return stub


@pytest.fixture
def sessions(projects, data, roles, audit_log):
    """How many short units of work were opened, and what each one had open at the Catastro."""
    opened = Mock()

    @contextmanager
    def open_session():
        opened.open()
        yield RefreshSession(projects, data, roles, audit_log)
        opened.close()

    open_session.opened = opened
    return open_session


@pytest.fixture
def refresh(get_property, sessions):
    use_case = RefreshTechnicalData(get_property, sessions, clock=lambda: NOW)
    return lambda raw=REFERENCE: use_case.execute(a_context(), "PRY-T-001", raw)


def test_fills_the_catastro_data_and_remembers_the_query(refresh, data):
    data.load.return_value = a_sheet()

    result = refresh()

    assert result.error is None
    assert result.sheet.get("builtArea").value == "308"
    assert result.sheet.get("builtArea").source is Source.CATASTRO
    assert result.last_query.cadastral_reference == REFERENCE
    assert result.last_query.queried_at == NOW
    data.record_query.assert_called_once_with("project-1", REFERENCE, NOW)
    saved = {d.field_id for d in data.save.call_args.args[1]}
    assert saved == {
        "address",
        "municipality",
        "propertyClass",
        "use",
        "year",
        "builtArea",
        "cadastralPlotArea",
        "coords",
    }


def test_the_unmapped_fields_are_reported(refresh, get_property, data):
    data.load.return_value = a_sheet()
    get_property.execute.return_value = a_property(use="Mixed uses", construction_year=None)

    result = refresh()

    assert result.unmapped == ("use", "year")
    assert result.sheet.get("use").value == ""


def test_edited_and_manual_data_survive(refresh, data):
    manual = TechnicalDatum(field_id="maxHeight", value="10,5", source=Source.MANUAL, verified=True)
    edited = a_row("builtArea", "142", value="138", verified=True)
    data.load.return_value = a_sheet(manual, edited)

    result = refresh()

    assert result.sheet.get("maxHeight") == manual
    assert (result.sheet.get("builtArea").value, result.sheet.get("builtArea").original) == (
        "138",
        "308",
    )
    assert result.sheet.get("builtArea").verified is True
    saved = {d.field_id: d for d in data.save.call_args.args[1]}
    assert "maxHeight" not in saved


def test_audits_who_what_before_and_after(refresh, data, audit_log):
    data.load.return_value = a_sheet(a_row("year", "1958", verified=True))

    refresh()

    (event,) = ok_events(audit_log)
    assert (event.entity, event.entity_id, event.action) == (
        "technical_data",
        "PRY-T-001",
        "refresh",
    )
    assert event.old_value["year"] == {"value": "1958", "original": "1958", "verified": True}
    assert event.new_value["changed"]["year"] == {
        "value": "1980",
        "original": "1980",
        "verified": False,
    }
    assert event.new_value["cadastral_reference"] == REFERENCE
    assert "unmapped" in event.new_value


def test_asks_for_authority_before_calling_the_catastro(
    refresh, roles, get_property, data, audit_log
):
    roles.roles_of.return_value = frozenset({ProjectRole.ARCHITECT})

    result = refresh()

    assert isinstance(result.error, NoAuthority)
    get_property.execute.assert_not_called()
    data.save.assert_not_called()
    assert rejected_events(audit_log)[0].action == "refresh"


def test_outside_the_briefing_phase_the_catastro_is_not_called(refresh, projects, get_property):
    projects.find.return_value = a_project(3)

    result = refresh()

    assert isinstance(result.error, TechnicalDataNotEditable)
    get_property.execute.assert_not_called()


def test_an_unknown_project_is_not_found(refresh, projects, get_property):
    projects.find.return_value = None

    assert isinstance(refresh().error, ProjectNotFound)
    get_property.execute.assert_not_called()


@pytest.mark.parametrize(
    "error",
    [
        CadastreUnavailable(),
        CadastreNotFound(),
        InvalidCadastralReference("invalid_cadastral_reference", "Mala."),
    ],
)
def test_when_the_catastro_fails_nothing_is_written(refresh, get_property, data, audit_log, error):
    get_property.execute.side_effect = error

    with pytest.raises(type(error)):
        refresh()

    data.save.assert_not_called()
    data.record_query.assert_not_called()
    assert ok_events(audit_log) == []


def test_the_catastro_is_called_with_no_unit_of_work_open(refresh, get_property, sessions):
    seen = []
    get_property.execute.side_effect = lambda raw: (
        seen.append(
            (sessions.opened.open.call_count, sessions.opened.close.call_count),
        )
        or a_property()
    )

    refresh()

    assert seen == [(1, 1)]
    assert sessions.opened.open.call_count == 2


def test_the_phase_is_checked_again_after_the_catastro_answers(
    refresh, projects, get_property, data, audit_log
):
    projects.find.side_effect = [a_project(2), a_project(3)]

    result = refresh()

    assert isinstance(result.error, TechnicalDataNotEditable)
    data.save.assert_not_called()
    assert rejected_events(audit_log)[0].new_value["error"] == "technical_data_not_editable"


def test_the_result_type_is_the_shared_one(refresh):
    assert isinstance(refresh(), TechnicalDataResult)


# --- RGB-26: plot area, altitude, slope and PV yield from their own origins ----------------------

PLOT_REFERENCE = REFERENCE[:14]
EXTERNAL_FIELDS = {"polygonPlotArea", "altitude", "slope", "slopeType", "pvProduction"}


@pytest.fixture
def get_plot():
    stub = create_autospec(GetPlotGeometry, spec_set=True, instance=True)
    stub.execute.return_value = _plot_from_metres(TRIANGLE)  # 2,700 m²
    return stub


@pytest.fixture
def get_terrain():
    stub = create_autospec(GetTerrainProfile, spec_set=True, instance=True)
    stub.execute.return_value = TerrainProfile(PLOT_REFERENCE, 33.0, 4.2)
    return stub


@pytest.fixture
def get_pv():
    stub = create_autospec(GetPvYield, spec_set=True, instance=True)
    stub.execute.return_value = PvYield(PvLocation(38.64, 0.039), 1617.61, 35.0, -3.0)
    return stub


@pytest.fixture
def refresh_all(get_property, get_plot, get_terrain, get_pv, sessions):
    use_case = RefreshTechnicalData(
        get_property,
        sessions,
        clock=lambda: NOW,
        get_plot=get_plot,
        get_terrain=get_terrain,
        get_pv=get_pv,
    )
    return lambda raw=REFERENCE: use_case.execute(a_context(), "PRY-T-001", raw)


def saved_ids(data):
    return {d.field_id for d in data.save.call_args.args[1]}


def test_fills_the_external_data_with_their_origins(refresh_all, data):
    data.load.return_value = a_sheet()

    result = refresh_all()

    assert result.error is None and result.unavailable == ()
    expected = {
        "polygonPlotArea": ("2700", Source.INSPIRE),
        "altitude": ("33", Source.OPEN_METEO),
        "slope": ("4,2", Source.CALCULATED),
        "slopeType": ("Suave (3–10 %)", Source.CALCULATED),
        "pvProduction": ("1618", Source.PVGIS),
    }
    for field_id, (value, source) in expected.items():
        datum = result.sheet.get(field_id)
        assert (datum.value, datum.original, datum.source) == (value, value, source)
        assert datum.verified is False
    assert EXTERNAL_FIELDS <= saved_ids(data)
    assert result.unmapped == ()


def test_the_services_are_asked_for_the_normalized_reference_the_catastro_returned(
    refresh_all, get_property, get_plot, get_terrain, get_pv, data
):
    data.load.return_value = a_sheet()
    get_property.execute.return_value = a_property()

    refresh_all(" 9872023vh5797s 0001wx ")

    for service in (get_plot, get_terrain, get_pv):
        service.execute.assert_called_once_with(REFERENCE)


@pytest.mark.parametrize(
    ("failing", "unavailable", "untouched"),
    [
        ("terrain", ("open_meteo",), {"altitude", "slope", "slopeType"}),
        ("pv", ("pvgis",), {"pvProduction"}),
    ],
)
def test_one_source_down_saves_the_catastro_and_the_other_sources(
    refresh_all, get_terrain, get_pv, data, failing, unavailable, untouched
):
    previous = [a_row(field_id, "7", source=Source.CATASTRO) for field_id in untouched]
    data.load.return_value = a_sheet(*previous)
    {"terrain": get_terrain, "pv": get_pv}[
        failing
    ].execute.side_effect = ExternalServiceUnavailable()

    result = refresh_all()

    assert result.error is None
    assert result.unavailable == unavailable
    assert saved_ids(data) == (
        {"address", "municipality", "propertyClass", "use", "year", "builtArea"}
        | {"cadastralPlotArea", "coords"}
        | (EXTERNAL_FIELDS - untouched)
    )
    for field_id in untouched:
        assert result.sheet.get(field_id).value == "7"
    data.record_query.assert_called_once_with("project-1", REFERENCE, NOW)


@pytest.mark.parametrize("error", [PlotNotFound(), CadastreUnavailable()])
def test_the_plot_down_also_leaves_what_needs_its_outline_unavailable(
    refresh_all, get_plot, get_terrain, get_pv, data, error
):
    data.load.return_value = a_sheet()
    get_plot.execute.side_effect = error

    result = refresh_all()

    assert result.unavailable == ("inspire", "open_meteo", "pvgis")
    get_terrain.execute.assert_not_called()  # it would ask the plot again, and wait again
    get_pv.execute.assert_not_called()
    assert saved_ids(data) == {
        "address",
        "municipality",
        "propertyClass",
        "use",
        "year",
        "builtArea",
        "cadastralPlotArea",
        "coords",
    }
    assert result.sheet.get("builtArea").value == "308"


def test_every_source_down_still_saves_the_catastro(
    refresh_all, get_plot, get_terrain, get_pv, data, audit_log
):
    data.load.return_value = a_sheet()
    get_terrain.execute.side_effect = ExternalServiceUnavailable()
    get_pv.execute.side_effect = ExternalServiceUnavailable()

    result = refresh_all()

    assert result.unavailable == ("open_meteo", "pvgis")
    assert saved_ids(data) == {"address", "municipality", "propertyClass", "use", "year"} | {
        "builtArea",
        "cadastralPlotArea",
        "coords",
        "polygonPlotArea",
    }
    (event,) = ok_events(audit_log)
    assert event.new_value["unavailable"] == ["open_meteo", "pvgis"]


def test_an_edited_external_datum_keeps_the_persons_value_and_verification(refresh_all, data):
    edited = a_row(
        "altitude", "25", value="30", source=Source.OPEN_METEO, verified=True
    )  # the person corrected the 25 m the service gave before
    data.load.return_value = a_sheet(edited)

    result = refresh_all()

    datum = result.sheet.get("altitude")
    assert (datum.value, datum.original, datum.verified, datum.edited) == ("30", "33", True, True)


def test_an_unedited_external_datum_that_changes_loses_its_verification(refresh_all, data):
    data.load.return_value = a_sheet(
        a_row("altitude", "25", source=Source.OPEN_METEO, verified=True),
        a_row("pvProduction", "1618", source=Source.PVGIS, verified=True),
    )

    result = refresh_all()

    assert result.sheet.get("altitude").verified is False  # 25 -> 33
    assert result.sheet.get("pvProduction").verified is True  # 1618 -> 1618
    assert "pvProduction" not in saved_ids(data)


def test_an_edited_slope_type_is_kept(refresh_all, data):
    data.load.return_value = a_sheet(
        a_row("slopeType", "Llana (< 3 %)", source=Source.CALCULATED, value="Moderada (10–20 %)")
    )

    result = refresh_all()

    assert result.sheet.get("slopeType").value == "Moderada (10–20 %)"
    assert result.sheet.get("slopeType").original == "Suave (3–10 %)"


def test_manual_planning_data_are_still_untouched(refresh_all, data):
    manual = TechnicalDatum(field_id="maxHeight", value="10,5", source=Source.MANUAL, verified=True)
    data.load.return_value = a_sheet(manual)

    assert refresh_all().sheet.get("maxHeight") == manual


def test_a_plot_without_a_slope_reports_slope_and_its_type_as_unmapped(
    refresh_all, get_terrain, data
):
    data.load.return_value = a_sheet()
    get_terrain.execute.return_value = TerrainProfile(PLOT_REFERENCE, 33.0, None)

    result = refresh_all()

    assert result.unmapped == ("slope", "slopeType")
    assert result.unavailable == ()
    assert result.sheet.get("altitude").value == "33"


def test_a_value_that_does_not_fit_its_field_is_unmapped_not_written(
    refresh_all, get_terrain, data
):
    data.load.return_value = a_sheet()
    get_terrain.execute.return_value = TerrainProfile(PLOT_REFERENCE, 33.0, 140.0)  # > 100 %

    result = refresh_all()

    assert result.unmapped == ("slope",)
    assert result.sheet.get("slope").value == ""
    assert result.sheet.get("slopeType").value == "Muy pronunciada (> 35 %)"


def test_an_unavailable_source_is_not_also_unmapped(refresh_all, get_pv, data):
    data.load.return_value = a_sheet()
    get_pv.execute.side_effect = ExternalServiceUnavailable()

    result = refresh_all()

    assert result.unmapped == ()
    assert result.unavailable == ("pvgis",)


def test_audits_the_external_changes_and_the_unavailable_sources(
    refresh_all, get_pv, data, audit_log
):
    data.load.return_value = a_sheet(a_row("altitude", "25", source=Source.OPEN_METEO))
    get_pv.execute.side_effect = ExternalServiceUnavailable()

    refresh_all()

    (event,) = ok_events(audit_log)
    assert event.old_value["altitude"] == {"value": "25", "original": "25", "verified": False}
    assert event.new_value["changed"]["altitude"] == {
        "value": "33",
        "original": "33",
        "verified": False,
    }
    assert event.new_value["changed"]["polygonPlotArea"]["value"] == "2700"
    assert "pvProduction" not in event.new_value["changed"]
    assert event.new_value["unavailable"] == ["pvgis"]


def test_nothing_external_is_asked_without_authority_or_in_the_wrong_phase(
    refresh_all, roles, projects, get_plot, get_terrain, get_pv
):
    roles.roles_of.return_value = frozenset({ProjectRole.ARCHITECT})
    assert isinstance(refresh_all().error, NoAuthority)
    roles.roles_of.return_value = frozenset({ProjectRole.PROJECT_DIRECTOR})
    projects.find.return_value = a_project(3)
    assert isinstance(refresh_all().error, TechnicalDataNotEditable)

    for service in (get_plot, get_terrain, get_pv):
        service.execute.assert_not_called()


def test_nothing_external_is_asked_when_the_catastro_fails(
    refresh_all, get_property, get_plot, get_terrain, get_pv, data
):
    get_property.execute.side_effect = CadastreUnavailable()

    with pytest.raises(CadastreUnavailable):
        refresh_all()

    for service in (get_plot, get_terrain, get_pv):
        service.execute.assert_not_called()
    data.save.assert_not_called()


def test_the_external_services_are_called_with_no_unit_of_work_open(
    refresh_all, get_plot, get_terrain, get_pv, sessions, data
):
    data.load.return_value = a_sheet()
    seen = []

    def watching(result):
        def call(raw):
            seen.append((sessions.opened.open.call_count, sessions.opened.close.call_count))
            return result

        return call

    get_plot.execute.side_effect = watching(_plot_from_metres(TRIANGLE))
    get_terrain.execute.side_effect = watching(TerrainProfile(PLOT_REFERENCE, 33.0, 4.2))
    get_pv.execute.side_effect = watching(PvYield(PvLocation(38.64, 0.039), 1617.61))

    refresh_all()

    assert seen == [(1, 1)] * 3
    assert sessions.opened.open.call_count == 2


def test_the_phase_is_checked_again_after_the_external_services_answer(
    refresh_all, projects, data, audit_log
):
    projects.find.side_effect = [a_project(2), a_project(3)]

    result = refresh_all()

    assert isinstance(result.error, TechnicalDataNotEditable)
    data.save.assert_not_called()


def test_without_external_sources_wired_nothing_is_unavailable(refresh, data):
    data.load.return_value = a_sheet()

    result = refresh()

    assert result.unavailable == ()
    assert saved_ids(data).isdisjoint(EXTERNAL_FIELDS)
