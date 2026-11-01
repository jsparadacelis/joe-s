"""Terrain: sampling points, the slope rule and its categories (limits 3/10/20/35 %)."""

import math

import pytest

from backend.app.external_data.domain.terrain import (
    SLOPE_CATEGORIES,
    InvalidTerrainData,
    TerrainProfile,
    estimate_slope_pct,
    profile_from_elevations,
    sampling_positions,
    slope_category,
)
from backend.app.technical_data.domain.catalog import definition_of
from backend.tests.external_data.domain.test_plot import REFERENCE, TRIANGLE, _plot_from_metres

# --- categories -------------------------------------------------------------------------------


def test_the_categories_are_exactly_the_options_of_the_slope_type_datum():
    assert SLOPE_CATEGORIES == definition_of("slopeType").options


@pytest.mark.parametrize(
    ("slope", "index"),
    [
        (0.0, 0),
        (2.9, 0),
        (2.99, 0),
        (3.0, 1),  # "< 3" is flat: 3 is already gentle
        (9.9, 1),
        (10.0, 2),
        (19.9, 2),
        (20.0, 3),
        (34.9, 3),
        (35.0, 3),  # "> 35" is strict: 35 is still steep
        (35.1, 4),
        (100.0, 4),
    ],
)
def test_the_category_changes_exactly_at_the_limits(slope, index):
    assert slope_category(slope) == SLOPE_CATEGORIES[index]


@pytest.mark.parametrize("bad", [-0.1, math.nan, math.inf])
def test_a_slope_that_is_not_a_percentage_has_no_category(bad):
    with pytest.raises(ValueError):
        slope_category(bad)


# --- the slope rule ---------------------------------------------------------------------------


def test_the_slope_is_the_largest_height_difference_over_its_horizontal_distance():
    # |103-100| = 3 over 50 m, |95-100| = 5 over 100 m: the 5 m difference wins -> 5 %.
    assert estimate_slope_pct(100.0, [(103.0, 50.0), (95.0, 100.0)]) == 5.0


def test_downhill_and_uphill_count_the_same():
    assert estimate_slope_pct(100.0, [(90.0, 100.0)]) == estimate_slope_pct(100.0, [(110.0, 100.0)])


def test_equal_height_differences_use_the_first_sample():
    assert estimate_slope_pct(100.0, [(103.0, 50.0), (97.0, 100.0)]) == 6.0


def test_the_slope_is_rounded_to_one_decimal():
    assert estimate_slope_pct(100.0, [(101.0, 3.0)]) == 33.3


def test_a_flat_site_has_zero_slope():
    assert estimate_slope_pct(33.0, [(33.0, 60.0), (33.0, 50.0)]) == 0.0


def test_a_sample_at_the_centroid_is_ignored():
    assert estimate_slope_pct(100.0, [(110.0, 0.0), (101.0, 50.0)]) == 2.0


@pytest.mark.parametrize("samples", [[], [(110.0, 0.0)]])
def test_without_a_sample_away_from_the_centroid_the_slope_is_unknown(samples):
    assert estimate_slope_pct(100.0, samples) is None


# --- sampling and profile ---------------------------------------------------------------------


def test_the_sampling_positions_are_the_centroid_then_the_two_farthest_vertices():
    plot = _plot_from_metres(TRIANGLE)

    assert sampling_positions(plot) == (
        plot.centroid,
        plot.vertices[1],
        plot.vertices[2],
    )


def test_a_profile_uses_the_centroid_altitude_and_the_slope_of_the_far_vertices():
    plot = _plot_from_metres(TRIANGLE)

    profile = profile_from_elevations(plot, [100.0, 103.0, 95.0])  # 3/63.25, 5/50 -> 10.0 %

    assert profile == TerrainProfile(REFERENCE, 100.0, 10.0)
    assert profile.slope_category == "Moderada (10–20 %)"


def test_a_flat_plot_gives_a_zero_slope_profile():
    plot = _plot_from_metres(TRIANGLE)

    profile = profile_from_elevations(plot, [50.0, 50.0, 50.0])

    assert (profile.altitude_m, profile.slope_pct, profile.slope_category) == (
        50.0,
        0.0,
        SLOPE_CATEGORIES[0],
    )


def test_a_wrong_number_of_elevations_is_rejected():
    with pytest.raises(ValueError):
        profile_from_elevations(_plot_from_metres(TRIANGLE), [100.0, 103.0])


# --- the profile ------------------------------------------------------------------------------


def test_a_profile_without_slope_has_no_category_and_says_so():
    profile = TerrainProfile(REFERENCE, 25.0, None)

    assert profile.slope_category is None
    assert profile.to_dict() == {
        "altitude_m": 25.0,
        "slope_pct": None,
        "slope_category": None,
        "estimated": True,
    }


def test_to_dict_has_the_api_shape_with_english_keys():
    assert TerrainProfile(REFERENCE, 33.0, 4.2).to_dict() == {
        "altitude_m": 33.0,
        "slope_pct": 4.2,
        "slope_category": "Suave (3–10 %)",
        "estimated": True,
    }


def test_from_dict_recomputes_the_category_and_ignores_other_keys():
    stored = {"altitude_m": 33.0, "slope_pct": 22.0, "slope_category": "stale", "x": 1}

    profile = TerrainProfile.from_dict(REFERENCE, stored)

    assert profile == TerrainProfile(REFERENCE, 33.0, 22.0)
    assert profile.slope_category == "Pronunciada (20–35 %)"


@pytest.mark.parametrize(
    "args",
    [
        ("SHORT", 1.0, 1.0),
        (REFERENCE, math.nan, 1.0),
        (REFERENCE, 1.0, -1.0),
        (REFERENCE, 1.0, math.inf),
    ],
)
def test_an_invalid_profile_is_rejected(args):
    with pytest.raises(InvalidTerrainData):
        TerrainProfile(*args)
