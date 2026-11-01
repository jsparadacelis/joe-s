/** Fictitious relief API response (RGB-33 contract) for the RGB-52 tests. */
export const API_REFERENCE = "1234567DG3413S0001AB";
/** The server answers with the 14-character parcel reference, never the 20 requested. */
export const API_PLOT_REFERENCE = "1234567DG3413S";

export type DegreeBox = { min_lon: number; min_lat: number; max_lon: number; max_lat: number };

/** Metric size of a degree box at its mean latitude (WGS84 series), the same scale the grid really has. */
export function boxMetres(box: DegreeBox): { width: number; height: number } {
  const phi = ((box.min_lat + box.max_lat) / 2) * (Math.PI / 180);
  const perDegLat = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
  const perDegLon = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
  return { width: (box.max_lon - box.min_lon) * perDegLon, height: (box.max_lat - box.min_lat) * perDegLat };
}

/** Window of the RGB-33 test plot; the server's nominal UTM size (125 × 131.18 m) is NOT the grid's size. */
export const REAL_BOX: DegreeBox = { min_lon: 0.03866314, min_lat: 38.63959584, max_lon: 0.04014612, max_lat: 38.64081273 };

/** Local size (m) of the default window below, derived from its degrees. */
export const API_WINDOW_M = boxMetres({ min_lon: 0, min_lat: 38, max_lon: 0.001, max_lat: 38.001 });

/**
 * Window of 0.001° × 0.001° (SW corner 0°, 38°) that the server describes (nominal, UTM) as 100 m × 200 m;
 * the viewer ignores those and uses `API_WINDOW_M`.
 * Grid of 3 columns × 2 rows, row 0 = north.
 */
export function apiReliefJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    reference: API_PLOT_REFERENCE,
    window: { min_lon: 0, min_lat: 38, max_lon: 0.001, max_lat: 38.001, width_m: 100, height_m: 200 },
    grid: { ncols: 3, nrows: 2, cell_size_m: 5, values: [10, 11, 12, 20, 21, 22], min_m: 10, max_m: 22 },
    outline: {
      type: "Polygon",
      coordinates: [
        [
          [0.00025, 38.00025],
          [0.00075, 38.00025],
          [0.00075, 38.00075],
          [0.00025, 38.00075],
          [0.00025, 38.00025],
        ],
      ],
    },
    clipped: false,
    parcel_clipped: false,
    plot_area_m2: 2905.99,
    ...overrides,
  };
}

/** `ncols × nrows` grid with the plane z = 10 + 2·column + 3·row (row 0 = north). */
export function planeGrid(ncols: number, nrows: number, nulls: ReadonlyArray<readonly [number, number]> = []) {
  const values: Array<number | null> = [];
  for (let row = 0; row < nrows; row++) {
    for (let col = 0; col < ncols; col++) {
      values.push(nulls.some(([r, c]) => r === row && c === col) ? null : 10 + 2 * col + 3 * row);
    }
  }
  return { ncols, nrows, cell_size_m: 5, values, min_m: 10, max_m: 10 + 2 * (ncols - 1) + 3 * (nrows - 1) };
}
