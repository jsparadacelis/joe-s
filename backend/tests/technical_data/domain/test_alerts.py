"""Cross-data alerts: each rule at its exact limits, with missing and garbage data."""

import copy
from decimal import Decimal

import pytest

from backend.app.technical_data.domain.alerts import (
    Alert,
    AlertConfig,
    ProjectFacts,
    Severity,
    evaluate_alerts,
)

NO_FACTS = ProjectFacts(project_type=None, location=None)


def codes(values, facts=NO_FACTS, config=None):
    return [a.code for a in evaluate_alerts(values, facts, config or AlertConfig())]


def only(values, facts=NO_FACTS, config=None) -> Alert:
    (alert,) = evaluate_alerts(values, facts, config or AlertConfig())
    return alert


def test_no_data_means_no_alerts():
    assert evaluate_alerts({}, NO_FACTS, AlertConfig()) == []


def test_the_defaults_are_the_agreed_ones():
    config = AlertConfig()
    assert config.area_difference_percent == Decimal(3)
    assert config.slope_percent == Decimal(10)
    assert config.built_before_year == 1980


# --- Rule 1: cadastral surface against the polygon -------------------------------------------


def test_areas_differing_by_exactly_3_percent_do_not_alert():
    assert codes({"cadastralPlotArea": "100", "polygonPlotArea": "103"}) == []
    assert codes({"cadastralPlotArea": "100", "polygonPlotArea": "97"}) == []


def test_areas_differing_by_more_than_3_percent_suggest_a_survey():
    alert = only({"cadastralPlotArea": "100", "polygonPlotArea": "103,1"})

    assert alert.code == "area_mismatch"
    assert alert.severity is Severity.WARNING
    assert alert.fields == ("cadastralPlotArea", "polygonPlotArea")
    assert "levantamiento topográfico" in alert.suggestion
    assert "100" in alert.message and "103,1" in alert.message


def test_a_smaller_polygon_alerts_too():
    assert codes({"cadastralPlotArea": "100", "polygonPlotArea": "96,9"}) == ["area_mismatch"]


@pytest.mark.parametrize(
    "values",
    [
        {"cadastralPlotArea": "100"},
        {"polygonPlotArea": "100"},
        {"cadastralPlotArea": "", "polygonPlotArea": "100"},
        {"cadastralPlotArea": "abc", "polygonPlotArea": "100"},
        {"cadastralPlotArea": "100", "polygonPlotArea": "1e9x"},
        {"cadastralPlotArea": "0", "polygonPlotArea": "100"},
        {"cadastralPlotArea": "-5", "polygonPlotArea": "100"},
    ],
)
def test_the_area_rule_needs_two_valid_numbers(values):
    assert codes(values) == []


def test_the_area_threshold_is_configurable():
    values = {"cadastralPlotArea": "100", "polygonPlotArea": "105"}
    assert codes(values) == ["area_mismatch"]
    assert codes(values, config=AlertConfig(area_difference_percent=Decimal(5))) == []


# --- Rule 2: cadastral use against the typology ----------------------------------------------


def facts(project_type=None, location=None):
    return ProjectFacts(project_type=project_type, location=location)


def test_an_industrial_use_for_a_single_family_house_is_a_possible_change_of_use():
    alert = only({"use": "Industrial"}, facts("single_family_house"))

    assert alert.code == "use_mismatch"
    assert alert.fields == ("use",)
    assert "cambio de uso" in alert.message.lower() or "cambio de uso" in alert.suggestion.lower()
    assert "Industrial" in alert.message


def test_a_compatible_use_does_not_alert():
    assert codes({"use": "Residencial"}, facts("single_family_house")) == []
    assert codes({"use": "Residencial"}, facts("multi_family")) == []
    assert codes({"use": "Industrial"}, facts("industrial")) == []


def test_housing_for_a_facility_or_an_industrial_project_alerts():
    assert codes({"use": "Residencial"}, facts("facility")) == ["use_mismatch"]
    assert codes({"use": "Residencial"}, facts("industrial")) == ["use_mismatch"]


@pytest.mark.parametrize("project_type", ["rehabilitation", "renovation_interiors"])
def test_rehabilitation_and_interiors_never_alert_on_use(project_type):
    assert codes({"use": "Industrial"}, facts(project_type)) == []


@pytest.mark.parametrize(
    ("values", "project_type"),
    [
        ({"use": "Uso inventado"}, "single_family_house"),  # unknown use
        ({"use": ""}, "single_family_house"),  # no use
        ({}, "single_family_house"),
        ({"use": "Industrial"}, None),  # no typology on the sheet
        ({"use": "Industrial"}, "something_new"),  # unknown typology
        ({"use": "Suelo sin edificar"}, "single_family_house"),
    ],
)
def test_unknown_or_missing_data_never_trigger_the_use_rule(values, project_type):
    assert codes(values, facts(project_type)) == []


def test_the_compatibility_table_is_configurable():
    config = AlertConfig(incompatible_uses={"single_family_house": frozenset({"Residencial"})})
    assert codes({"use": "Residencial"}, facts("single_family_house"), config) == ["use_mismatch"]
    assert codes({"use": "Industrial"}, facts("single_family_house"), config) == []


# --- Rule 3: buildings before 1980 -----------------------------------------------------------


def test_1980_exactly_does_not_alert_but_1979_does():
    assert codes({"year": "1980"}) == []
    alert = only({"year": "1979"})
    assert alert.code == "pre_1980_building"
    assert alert.fields == ("year",)
    assert "1979" in alert.message
    for word in ("estructura", "amianto", "normativa"):
        assert word in alert.suggestion


@pytest.mark.parametrize("year", ["", "abc", "19x0", "1958,5", "-1950", "0", "950", "20000"])
def test_garbage_years_never_alert(year):
    assert codes({"year": year}) == []


def test_the_year_is_configurable():
    assert codes({"year": "1985"}, config=AlertConfig(built_before_year=1990)) == [
        "pre_1980_building"
    ]


# --- Rule 4: slope ---------------------------------------------------------------------------


def test_a_slope_equal_to_the_threshold_does_not_alert():
    assert codes({"slope": "10"}) == []
    assert codes({"slope": "10,0"}) == []


def test_a_slope_over_the_threshold_asks_for_a_survey_and_retaining_walls():
    alert = only({"slope": "10,1"})

    assert alert.code == "steep_slope"
    assert alert.fields == ("slope",)
    assert "topográfico" in alert.suggestion and "contenciones" in alert.suggestion


@pytest.mark.parametrize("slope", ["", "abc", "-12", "1e2"])
def test_garbage_slopes_never_alert(slope):
    assert codes({"slope": slope}) == []


def test_the_slope_threshold_is_configurable():
    assert codes({"slope": "6"}, config=AlertConfig(slope_percent=Decimal(5))) == ["steep_slope"]


# --- Rule 5: municipality against the sheet's location ---------------------------------------


@pytest.mark.parametrize(
    ("municipality", "location"),
    [
        ("VALENCIA (VALENCIA)", "Valencia"),
        ("VALENCIA (VALENCIA)", "  valencia  "),
        ("Alcalá de Henares (MADRID)", "alcala de henares"),
        ("ALCALÁ DE HENARES (MADRID)", "Alcalá de Henares, Madrid"),
        ("TORRENT (VALENCIA)", "Valencia"),  # the province: not enough to say they differ
        ("TORRENT (VALENCIA)", "Torrent, Valencia"),
        ("CORUÑA, A (A CORUÑA)", "A Coruña"),
        ("PALMAS DE GRAN CANARIA, LAS (PALMAS, LAS)", "Las Palmas de Gran Canaria"),
        ("ALICANTE/ALACANT (ALICANTE)", "Alacant"),
        ("ALCALÁ DE HENARES (MADRID)", "Alcalá"),  # shortened name
        ("MADRID (MADRID)", "Calle Mayor 3, Madrid"),
    ],
)
def test_coherent_municipalities_do_not_alert(municipality, location):
    assert codes({"municipality": municipality}, facts(location=location)) == []


def test_a_different_municipality_is_a_possible_inconsistency():
    alert = only({"municipality": "SEGOVIA (SEGOVIA)"}, facts(location="Valencia"))

    assert alert.code == "municipality_mismatch"
    assert alert.fields == ("municipality",)
    assert "SEGOVIA (SEGOVIA)" in alert.message and "Valencia" in alert.message


@pytest.mark.parametrize(
    ("municipality", "location"),
    [
        ("", "Valencia"),
        ("SEGOVIA (SEGOVIA)", ""),
        ("SEGOVIA (SEGOVIA)", None),
        ("SEGOVIA (SEGOVIA)", "   "),
        ("SEGOVIA (SEGOVIA)", "de la"),  # nothing left once articles are dropped
        ("(SEGOVIA)", "Valencia"),
        ("de", "Valencia"),
    ],
)
def test_missing_or_empty_municipality_data_never_alert(municipality, location):
    assert codes({"municipality": municipality}, facts(location=location)) == []


# --- Several rules, and nothing is changed ---------------------------------------------------


def test_several_rules_can_fire_together_in_a_fixed_order():
    values = {
        "cadastralPlotArea": "100",
        "polygonPlotArea": "120",
        "use": "Industrial",
        "year": "1960",
        "slope": "15",
        "municipality": "SEGOVIA (SEGOVIA)",
    }

    assert codes(values, facts("single_family_house", "Valencia")) == [
        "area_mismatch",
        "use_mismatch",
        "pre_1980_building",
        "steep_slope",
        "municipality_mismatch",
    ]


def test_evaluating_alerts_does_not_modify_its_input():
    values = {"cadastralPlotArea": "100", "polygonPlotArea": "120", "year": "1960"}
    project = facts("single_family_house", "Valencia")
    config = AlertConfig()
    before = copy.deepcopy((values, project, config))

    evaluate_alerts(values, project, config)

    assert (values, project, config) == before
    assert values == {"cadastralPlotArea": "100", "polygonPlotArea": "120", "year": "1960"}


def test_alerts_are_immutable_values():
    alert = only({"year": "1960"})
    with pytest.raises(AttributeError):
        alert.code = "other"  # type: ignore[misc]
