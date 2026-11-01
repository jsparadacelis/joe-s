"""'Query again': authority first, then the Catastro, then one short write; a failure writes nothing."""

from contextlib import contextmanager
from unittest.mock import Mock, create_autospec

import pytest

from backend.app.access.domain.project_roles import ProjectRole
from backend.app.external_data.application.get_cadastral_property import GetCadastralProperty
from backend.app.external_data.domain.cadastral_reference import InvalidCadastralReference
from backend.app.external_data.domain.errors import CadastreNotFound, CadastreUnavailable
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
