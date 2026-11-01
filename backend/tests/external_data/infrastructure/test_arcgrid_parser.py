"""The ArcGrid (ESRI ASCII grid) reader of the WCS answer: a white list, never a guess."""

import pytest

from backend.app.external_data.domain.errors import ReliefUnavailable
from backend.app.external_data.infrastructure.arcgrid_parser import (
    MAX_BODY_BYTES,
    parse_arcgrid,
)
from backend.tests.external_data.infrastructure.recorded import fixture

HEADER = "ncols 3\nnrows 2\nxllcorner 0.5\nyllcorner 38.5\ndx 0.001\ndy 0.001\n"


def grid_text(rows="1 2 3\n4 5 6\n", header=HEADER):
    return (header + rows).encode()


def test_the_recorded_answer_is_read_north_first_with_its_extremes():
    grid = parse_arcgrid(fixture("wcs_arcgrid_ok.asc"), 25, 27)

    assert (grid.ncols, grid.nrows) == (25, 27)
    assert len(grid.values) == 675
    assert grid.values[0] == 36.752  # north-west corner
    assert grid.values[24] == 54.0  # north-east corner
    assert grid.values[25] == 35.982  # first cell of the second row
    assert grid.values[-1] == 31.0  # south-east corner
    assert (grid.min_m, grid.max_m) == (18.222, 54.039)


def test_values_are_row_major_whatever_the_line_breaks():
    one_line = parse_arcgrid(grid_text("1 2 3 4 5 6"), 3, 2)
    per_row = parse_arcgrid(grid_text("1 2 3\n4 5 6\n"), 3, 2)
    indented = parse_arcgrid(grid_text("  1.0   2 3\r\n  4 5 6.0\r\n"), 3, 2)

    assert one_line.values == per_row.values == indented.values == (1.0, 2.0, 3.0, 4.0, 5.0, 6.0)


def test_header_names_are_case_insensitive_and_cellsize_is_accepted():
    header = "NCOLS 3\nNROWS 2\nXLLCENTER 0.5\nYLLCENTER 38.5\nCELLSIZE 0.001\n"

    grid = parse_arcgrid(grid_text(header=header), 3, 2)

    assert grid.values == (1.0, 2.0, 3.0, 4.0, 5.0, 6.0)


def test_the_nodata_value_marks_cells_without_data():
    header = HEADER + "NODATA_value -9999\n"

    grid = parse_arcgrid(grid_text("1 -9999 3\n-9999.0 5 6\n", header=header), 3, 2)

    assert grid.values == (1.0, None, 3.0, None, 5.0, 6.0)
    assert (grid.min_m, grid.max_m) == (1.0, 6.0)


def test_without_a_nodata_value_every_number_is_a_height():
    grid = parse_arcgrid(grid_text("1 -400 3\n4 5 6\n"), 3, 2)

    assert grid.values[1] == -400.0


def test_a_grid_made_only_of_nodata_is_unavailable():
    header = HEADER + "NODATA_value -9999\n"

    with pytest.raises(ReliefUnavailable):
        parse_arcgrid(grid_text("-9999 -9999 -9999\n-9999 -9999 -9999\n", header=header), 3, 2)


@pytest.mark.parametrize(
    "body",
    [
        b"",
        b"   \n",
        b"<?xml version='1.0'?><ServiceExceptionReport version='1.2.0'/>",
        fixture("wcs_service_exception.xml"),
        b"<html><body>Bad gateway</body></html>",
        b"\xff\xfe\x00 not text",
        b'{"error": true}',
    ],
)
def test_anything_that_is_not_an_ascii_grid_is_unavailable(body):
    with pytest.raises(ReliefUnavailable):
        parse_arcgrid(body, 3, 2)


@pytest.mark.parametrize(
    "header",
    [
        "ncols 4\nnrows 2\n",  # not the size asked for
        "ncols 3\nnrows 3\n",
        "ncols 3\n",  # a missing dimension
        "nrows 2\n",
        "ncols three\nnrows 2\n",
        "ncols 3.5\nnrows 2\n",
        "ncols 3\nnrows 2\nncols 3\n",  # a repeated key
        "ncols 3\nnrows 2\nprojection UTM\n",  # a key outside the white list
        "ncols 3\nnrows 2\nxllcorner nan\n",
        "ncols 3\nnrows 2\ndx inf\n",
        "ncols 3\nnrows 2\nNODATA_value abc\n",
        "ncols\nnrows 2\n",
    ],
)
def test_a_header_that_does_not_say_exactly_what_was_asked_is_unavailable(header):
    with pytest.raises(ReliefUnavailable):
        parse_arcgrid(grid_text(header=header), 3, 2)


@pytest.mark.parametrize(
    "rows",
    [
        "1 2 3\n4 5\n",  # too few
        "1 2 3\n4 5 6 7\n",  # too many
        "",
        "1 2 3\n4 5 six\n",
        "1 2 3\n4 5 nan\n",
        "1 2 3\n4 5 inf\n",
        "1 2 3\n4 5 -inf\n",
        "1 2 3\n4 5 1e999\n",
        "1 2 3\n4 5 9001\n",  # above any ground level
        "1 2 3\n4 5 -501\n",  # below any ground level
        "1 2 3\n4 5 6, 7\n",
    ],
)
def test_values_that_are_missing_extra_or_not_plausible_heights_are_unavailable(rows):
    with pytest.raises(ReliefUnavailable):
        parse_arcgrid(grid_text(rows), 3, 2)


def test_the_limits_of_a_plausible_height_are_accepted():
    grid = parse_arcgrid(grid_text("-500 0 9000\n1 2 3\n"), 3, 2)

    assert (grid.min_m, grid.max_m) == (-500.0, 9000.0)


def test_a_body_larger_than_any_valid_answer_is_refused_unread():
    huge = grid_text("1 " * MAX_BODY_BYTES)

    with pytest.raises(ReliefUnavailable):
        parse_arcgrid(huge, 3, 2)


def test_the_largest_valid_grid_fits_in_the_body_limit():
    cells = 100 * 100
    header = "ncols 100\nnrows 100\nxllcorner 0.5\nyllcorner 38.5\ndx 0.001\ndy 0.001\n"
    rows = ("9000.000 " * 100 + "\n") * 100

    assert len(header + rows) < MAX_BODY_BYTES
    assert len(parse_arcgrid((header + rows).encode(), 100, 100).values) == cells
