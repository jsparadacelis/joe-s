"""Portfolio status and days-since-update rules (pure domain)."""

from datetime import datetime, timedelta, timezone

import pytest

from backend.app.portfolio.domain.project import ProjectRecord, days_since, status_of

NOW = datetime(2026, 10, 24, 15, 0, tzinfo=timezone.utc)


def a_record(**overrides):
    data = {
        "code": "PRY-2026-001",
        "name": "House (sample)",
        "current_phase": 2,
        "paused": False,
        "traffic_light": None,
        "next_milestone": None,
        "responsible_id": None,
        "updated_at": NOW,
    }
    data.update(overrides)
    return ProjectRecord(**data)


class TestStatus:
    def test_phase_zero_is_no_plan(self):
        assert status_of(a_record(current_phase=0)) == "no_plan"

    def test_phase_zero_wins_over_pause_and_traffic_light(self):
        assert status_of(a_record(current_phase=0, paused=True, traffic_light="red")) == "no_plan"

    def test_paused_wins_over_traffic_light(self):
        assert status_of(a_record(paused=True, traffic_light="green")) == "paused"

    @pytest.mark.parametrize("light", ["green", "amber", "red"])
    def test_traffic_light_is_the_status(self, light):
        assert status_of(a_record(traffic_light=light)) == light

    def test_otherwise_unknown(self):
        assert status_of(a_record()) == "unknown"


class TestDaysSince:
    def test_same_instant_is_zero(self):
        assert days_since(NOW, NOW) == 0

    def test_whole_days(self):
        assert days_since(datetime(2026, 10, 20, 23, 59, tzinfo=timezone.utc), NOW) == 4

    def test_counts_utc_calendar_days_not_elapsed_hours(self):
        late = datetime(2026, 10, 23, 23, 59, tzinfo=timezone.utc)
        early = datetime(2026, 10, 24, 0, 1, tzinfo=timezone.utc)

        assert days_since(late, early) == 1

    def test_other_time_zones_are_converted_to_utc(self):
        updated = datetime(2026, 10, 24, 1, 0, tzinfo=timezone(timedelta(hours=2)))

        assert days_since(updated, NOW) == 1  # 2026-10-23 23:00 UTC

    def test_never_negative(self):
        assert days_since(datetime(2026, 10, 25, tzinfo=timezone.utc), NOW) == 0
