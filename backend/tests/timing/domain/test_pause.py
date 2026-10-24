"""Pause entity, authority and input validation: pure domain, no I/O."""

from datetime import date

import pytest

from backend.app.study.domain.context import RequestContext, Role
from backend.app.timing.domain.errors import InvalidField, RequiredField
from backend.app.timing.domain.pause import Pause, PauseRequest, can_manage_pauses
from backend.app.timing.domain.time_tracking import PauseReason

TODAY = date(2026, 10, 24)


def a_pause(**overrides):
    values = {
        "id": "pause-1",
        "project_id": "project-1",
        "phase": 1,
        "reason": PauseReason.CLIENT_WAIT,
        "started_on": date(2026, 10, 20),
        "expected_resumption": date(2026, 11, 9),
        "opened_by": "demo-user",
    }
    values.update(overrides)
    return Pause(**values)


def a_context(role):
    return RequestContext(study_id="study-1", user_id="demo-user", role=role)


class TestAuthority:
    @pytest.mark.parametrize("role", [Role.PROJECT_DIRECTOR, Role.DIRECTOR, Role.PARTNER])
    def test_project_director_director_and_partner_can_manage_pauses(self, role):
        assert can_manage_pauses(a_context(role)) is True

    @pytest.mark.parametrize("role", [Role.TECHNICAL_LEAD, Role.ARCHITECT, Role.SITE_COLLABORATOR])
    def test_other_roles_cannot(self, role):
        assert can_manage_pauses(a_context(role)) is False


class TestOverdue:
    def test_open_pause_is_not_overdue_on_or_before_the_expected_date(self):
        pause = a_pause(expected_resumption=TODAY)

        assert pause.overdue(TODAY) is False
        assert pause.days_overdue(TODAY) == 0

    def test_open_pause_is_overdue_the_day_after_the_expected_date(self):
        pause = a_pause(expected_resumption=date(2026, 10, 23))

        assert pause.overdue(TODAY) is True
        assert pause.days_overdue(TODAY) == 1

    def test_days_overdue_counts_whole_days(self):
        pause = a_pause(expected_resumption=date(2026, 10, 14))

        assert pause.days_overdue(TODAY) == 10

    def test_closed_pause_is_never_overdue(self):
        pause = a_pause(expected_resumption=date(2026, 10, 14), resumed_on=date(2026, 10, 22))

        assert pause.overdue(TODAY) is False
        assert pause.days_overdue(TODAY) == 0

    def test_is_open_depends_on_resumed_on(self):
        assert a_pause().is_open is True
        assert a_pause(resumed_on=date(2026, 10, 22)).is_open is False


class TestPauseRequest:
    def test_accepts_a_valid_input(self):
        request = PauseRequest.from_input(
            {"reason": "authority_wait", "expected_resumption": "2026-11-09"}, TODAY
        )

        assert request.reason is PauseReason.AUTHORITY_WAIT
        assert request.expected_resumption == date(2026, 11, 9)

    def test_today_is_a_valid_expected_date(self):
        request = PauseRequest.from_input(
            {"reason": "other", "expected_resumption": "2026-10-24"}, TODAY
        )

        assert request.expected_resumption == TODAY

    @pytest.mark.parametrize("value", [None, "", "   "])
    def test_missing_reason_is_required(self, value):
        with pytest.raises(RequiredField) as error:
            PauseRequest.from_input({"reason": value, "expected_resumption": "2026-11-09"}, TODAY)

        assert (error.value.code, error.value.field) == ("required_field", "reason")
        assert error.value.message == "El campo «Motivo» es obligatorio."

    def test_absent_reason_is_required(self):
        with pytest.raises(RequiredField) as error:
            PauseRequest.from_input({"expected_resumption": "2026-11-09"}, TODAY)

        assert error.value.field == "reason"

    @pytest.mark.parametrize("value", ["vacation", "CLIENT_WAIT", 3, True, ["other"]])
    def test_unknown_reason_is_invalid(self, value):
        with pytest.raises(InvalidField) as error:
            PauseRequest.from_input({"reason": value, "expected_resumption": "2026-11-09"}, TODAY)

        assert (error.value.code, error.value.field) == ("invalid_field", "reason")
        assert error.value.message == "El campo «Motivo» no es válido: no es un motivo admitido."

    @pytest.mark.parametrize("value", [None, "", "  "])
    def test_missing_date_is_required(self, value):
        with pytest.raises(RequiredField) as error:
            PauseRequest.from_input({"reason": "other", "expected_resumption": value}, TODAY)

        assert error.value.field == "expected_resumption"
        assert error.value.message == "El campo «Fecha prevista de reanudación» es obligatorio."

    @pytest.mark.parametrize("value", ["2026-02-30", "2026-13-01"])
    def test_non_existent_date_is_invalid(self, value):
        with pytest.raises(InvalidField) as error:
            PauseRequest.from_input({"reason": "other", "expected_resumption": value}, TODAY)

        assert error.value.message == (
            "El campo «Fecha prevista de reanudación» no es válido: no es una fecha existente."
        )

    @pytest.mark.parametrize("value", ["24/10/2026", "2026-1-5", "tomorrow", 20261109, True])
    def test_badly_formatted_date_is_invalid(self, value):
        with pytest.raises(InvalidField) as error:
            PauseRequest.from_input({"reason": "other", "expected_resumption": value}, TODAY)

        assert error.value.field == "expected_resumption"
        assert error.value.message.startswith(
            "El campo «Fecha prevista de reanudación» no es válido: "
        )

    def test_date_before_today_is_invalid(self):
        with pytest.raises(InvalidField) as error:
            PauseRequest.from_input({"reason": "other", "expected_resumption": "2026-10-23"}, TODAY)

        assert error.value.message == (
            "El campo «Fecha prevista de reanudación» no es válido: no puede ser anterior a hoy."
        )

    def test_reports_the_first_invalid_field_in_contract_order(self):
        with pytest.raises(InvalidField) as error:
            PauseRequest.from_input({"reason": "nope", "expected_resumption": "bad"}, TODAY)

        assert error.value.field == "reason"

    def test_reason_required_comes_before_an_invalid_date(self):
        with pytest.raises(RequiredField) as error:
            PauseRequest.from_input({"expected_resumption": "bad"}, TODAY)

        assert error.value.field == "reason"
