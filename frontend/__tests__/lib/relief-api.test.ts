/**
 * RGB-52 · contract for `@/lib/relief-api` (new module; `lib/relief.ts` keeps the types, the pure functions and the
 * synthetic terrain `fetchRelief`, now only for the PRY-EJ-* samples):
 *   RELIEF_SOURCE = "MDT 5 m, IGN"
 *   reliefFromResponse(raw: unknown, options: ReliefOptions): Relief       pure; throws ApiError(502, "invalid_relief_response")
 *   fetchReliefFromApi(options: ReliefOptions, request?: ApiRequest): Promise<Relief>
 *        request(`/api/cadastre/${encodeURIComponent(reference)}/relief?margin=${margin}&max_side=${maxSide}`, { method: "GET" })
 *   reliefFetcherFor(code: string): (options: ReliefOptions) => Promise<Relief>     sample project -> synthetic fetchRelief, else the API
 * `Relief` gains `noDataCells?: number` (cells that came as null and were estimated; 0 when none).
 *
 * Local projection (the grid covers EXACTLY the degree box of `window`, so the perimeter must line up with it):
 *   x = (lon - min_lon) / (max_lon - min_lon) * width_m
 *   y = (lat - min_lat) / (max_lat - min_lat) * height_m
 *   viewWindow = [0, 0, width_m, height_m]  (origin at the south-west corner)
 */
import { ApiError, type ApiRequest } from "@/lib/api";
import { fetchRelief, type ReliefOptions } from "@/lib/relief";
import { fetchReliefFromApi, RELIEF_SOURCE, reliefFetcherFor, reliefFromResponse } from "@/lib/relief-api";
import { API_REFERENCE, apiReliefJson, planeGrid } from "../helpers/relief-api-response";

const OPTIONS: ReliefOptions = { reference: API_REFERENCE, margin: 25, maxSide: 200 };
const TOL = 1e-6;

const fakeRequest = (value: unknown) => jest.fn(async () => value) as unknown as jest.MockedFunction<ApiRequest>;

function invalid(raw: unknown): ApiError {
  try {
    reliefFromResponse(raw, OPTIONS);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("reliefFromResponse did not throw");
}

describe("RELIEF_SOURCE", () => {
  it("names the IGN's 5 m MDT", () => {
    expect(RELIEF_SOURCE).toBe("MDT 5 m, IGN");
  });
});

describe("reliefFromResponse · window and grid", () => {
  it("the window is in local metres with the origin at the south-west corner", () => {
    expect(reliefFromResponse(apiReliefJson(), OPTIONS).viewWindow).toEqual([0, 0, 100, 200]);
  });

  it("columns and rows come from the grid, and heights keep the reading order (row 0 = north)", () => {
    const r = reliefFromResponse(apiReliefJson(), OPTIONS);
    expect(r.columns).toBe(3);
    expect(r.rows).toBe(2);
    expect(r.heights).toEqual([10, 11, 12, 20, 21, 22]);
  });

  it("the reference is the requested 20-character one, not the 14-character parcel reference of the response", () => {
    // The viewer asks again with `relief.reference` when the margin changes: a 14-character one would be a 422.
    expect(reliefFromResponse(apiReliefJson(), OPTIONS).reference).toBe(API_REFERENCE);
  });

  it("source, polygonSurface = plot_area_m2, clamped = clipped and plotClipped = parcel_clipped", () => {
    const base = reliefFromResponse(apiReliefJson(), OPTIONS);
    expect(base.source).toBe("MDT 5 m, IGN");
    expect(base.polygonSurface).toBe(2905.99);
    expect(base.clamped).toBe(false);
    expect(base.plotClipped).toBe(false);

    const flags = reliefFromResponse(apiReliefJson({ clipped: true, parcel_clipped: false }), OPTIONS);
    expect(flags.clamped).toBe(true);
    expect(flags.plotClipped).toBe(false);
    const other = reliefFromResponse(apiReliefJson({ clipped: false, parcel_clipped: true }), OPTIONS);
    expect(other.clamped).toBe(false);
    expect(other.plotClipped).toBe(true);
  });

  it("does not modify the response it receives", () => {
    const raw = apiReliefJson({ grid: planeGrid(4, 4, [[1, 1]]) });
    const copy = JSON.parse(JSON.stringify(raw));
    reliefFromResponse(raw, OPTIONS);
    expect(raw).toEqual(copy);
  });
});

describe("reliefFromResponse · perimeter in local metres", () => {
  it("projects lon/lat linearly onto the window and drops the closing vertex", () => {
    const { perimeter } = reliefFromResponse(apiReliefJson(), OPTIONS);
    expect(perimeter).toHaveLength(4);
    const expected = [
      [25, 50],
      [75, 50],
      [75, 150],
      [25, 150],
    ];
    perimeter.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(expected[i][0], 6);
      expect(y).toBeCloseTo(expected[i][1], 6);
    });
  });

  it("the window corners map to (0, 0) and (width_m, height_m)", () => {
    const outline = {
      type: "Polygon",
      coordinates: [[[0, 38], [0.001, 38], [0.001, 38.001], [0, 38]]],
    };
    const { perimeter } = reliefFromResponse(apiReliefJson({ outline }), OPTIONS);
    expect(perimeter[0][0]).toBeCloseTo(0, 6);
    expect(perimeter[0][1]).toBeCloseTo(0, 6);
    expect(perimeter[1][0]).toBeCloseTo(100, 6);
    expect(perimeter[1][1]).toBeCloseTo(0, 6);
    expect(perimeter[2][0]).toBeCloseTo(100, 6);
    expect(perimeter[2][1]).toBeCloseTo(200, 6);
  });

  it("known values of the RGB-33 test plot (window of 125 × 131.18 m)", () => {
    const window = { min_lon: 0.03866314, min_lat: 38.63959584, max_lon: 0.04014612, max_lat: 38.64081273, width_m: 125, height_m: 131.18 };
    const outline = {
      type: "Polygon",
      coordinates: [[[0.038965, 38.64042], [0.039031, 38.640357], [0.038965, 38.64042]]],
    };
    const r = reliefFromResponse(apiReliefJson({ window, outline }), OPTIONS);
    expect(r.viewWindow).toEqual([0, 0, 125, 131.18]);
    expect(r.perimeter[0][0]).toBeCloseTo(25.443701, 4);
    expect(r.perimeter[0][1]).toBeCloseTo(88.843945, 4);
    // Everything stays inside the window.
    for (const [x, y] of r.perimeter) {
      expect(x).toBeGreaterThanOrEqual(-TOL);
      expect(x).toBeLessThanOrEqual(125 + TOL);
      expect(y).toBeGreaterThanOrEqual(-TOL);
      expect(y).toBeLessThanOrEqual(131.18 + TOL);
    }
  });

  it("north is up: a higher latitude gives a higher y, an eastern longitude a higher x", () => {
    const { perimeter } = reliefFromResponse(apiReliefJson(), OPTIONS);
    expect(perimeter[2][1]).toBeGreaterThan(perimeter[0][1]);
    expect(perimeter[1][0]).toBeGreaterThan(perimeter[0][0]);
  });

  it("Polygon with holes: only the exterior ring is used", () => {
    const outline = {
      type: "Polygon",
      coordinates: [
        [[0.0001, 38.0001], [0.0009, 38.0001], [0.0009, 38.0009], [0.0001, 38.0009], [0.0001, 38.0001]],
        [[0.0004, 38.0004], [0.0004, 38.0006], [0.0006, 38.0006], [0.0006, 38.0004], [0.0004, 38.0004]],
      ],
    };
    const { perimeter } = reliefFromResponse(apiReliefJson({ outline }), OPTIONS);
    expect(perimeter).toHaveLength(4);
    expect(perimeter[0][0]).toBeCloseTo(10, 6);
    expect(perimeter[2][0]).toBeCloseTo(90, 6);
  });

  it("MultiPolygon: the exterior ring of the part with the largest area", () => {
    const small = [[[0.0001, 38.0001], [0.0002, 38.0001], [0.0002, 38.0002], [0.0001, 38.0002], [0.0001, 38.0001]]];
    const large = [[[0.0005, 38.0005], [0.0009, 38.0005], [0.0009, 38.0009], [0.0005, 38.0009], [0.0005, 38.0005]]];
    for (const parts of [[small, large], [large, small]]) {
      const { perimeter } = reliefFromResponse(apiReliefJson({ outline: { type: "MultiPolygon", coordinates: parts } }), OPTIONS);
      expect(perimeter).toHaveLength(4);
      expect(perimeter[0][0]).toBeCloseTo(50, 6);
      expect(perimeter[0][1]).toBeCloseTo(100, 6);
      expect(perimeter[2][0]).toBeCloseTo(90, 6);
      expect(perimeter[2][1]).toBeCloseTo(180, 6);
    }
  });

  it("outline null: empty perimeter (the viewer shows no readings and says so)", () => {
    const r = reliefFromResponse(apiReliefJson({ outline: null }), OPTIONS);
    expect(r.perimeter).toEqual([]);
    expect(r.heights).toHaveLength(6);
  });
});

describe("reliefFromResponse · cells without data (null)", () => {
  it("no nulls: noDataCells is 0 and the heights are untouched", () => {
    const r = reliefFromResponse(apiReliefJson({ grid: planeGrid(4, 4) }), OPTIONS);
    expect(r.noDataCells).toBe(0);
    expect(r.heights).toEqual(planeGrid(4, 4).values);
  });

  it("an interior null is estimated from its neighbours (exact on a plane) and counted", () => {
    const r = reliefFromResponse(apiReliefJson({ grid: planeGrid(4, 4, [[1, 1]]) }), OPTIONS);
    expect(r.noDataCells).toBe(1);
    expect(r.heights).toHaveLength(16);
    expect(r.heights[1 * 4 + 1]).toBeCloseTo(10 + 2 + 3, 9);
    // The rest of the cells are left exactly as they came.
    const original = planeGrid(4, 4).values;
    r.heights.forEach((h, i) => {
      if (i !== 5) expect(h).toBe(original[i]);
    });
  });

  it("nulls on the corner and edges and a whole row of them: every height is finite and within the data range", () => {
    const nulls = [[0, 0], [3, 3], [0, 2], [2, 0], [1, 0], [1, 1], [1, 2], [1, 3]] as const;
    const grid = planeGrid(4, 4, nulls);
    const known = grid.values.filter((v): v is number => v !== null);
    const r = reliefFromResponse(apiReliefJson({ grid }), OPTIONS);
    expect(r.noDataCells).toBe(nulls.length);
    expect(r.heights).toHaveLength(16);
    for (const h of r.heights) {
      expect(Number.isFinite(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(Math.min(...known) - TOL);
      expect(h).toBeLessThanOrEqual(Math.max(...known) + TOL);
    }
  });

  it("a grid with no data at all is not a relief: invalid_relief_response", () => {
    const grid = { ncols: 2, nrows: 2, cell_size_m: 5, values: [null, null, null, null], min_m: 0, max_m: 0 };
    expect(invalid(apiReliefJson({ grid })).code).toBe("invalid_relief_response");
  });
});

describe("reliefFromResponse · malformed responses", () => {
  const cases: Array<[string, unknown]> = [
    ["undefined", undefined],
    ["null", null],
    ["a string", "relief"],
    ["an array", []],
    ["no window", apiReliefJson({ window: undefined })],
    ["a window without width_m", apiReliefJson({ window: { min_lon: 0, min_lat: 38, max_lon: 0.001, max_lat: 38.001, height_m: 200 } })],
    ["a window with width_m = 0", apiReliefJson({ window: { min_lon: 0, min_lat: 38, max_lon: 0.001, max_lat: 38.001, width_m: 0, height_m: 200 } })],
    ["a window with max_lon <= min_lon", apiReliefJson({ window: { min_lon: 0.001, min_lat: 38, max_lon: 0.001, max_lat: 38.001, width_m: 100, height_m: 200 } })],
    ["a window with a string coordinate", apiReliefJson({ window: { min_lon: "0", min_lat: 38, max_lon: 0.001, max_lat: 38.001, width_m: 100, height_m: 200 } })],
    ["no grid", apiReliefJson({ grid: undefined })],
    ["fewer values than ncols × nrows", apiReliefJson({ grid: { ncols: 3, nrows: 2, cell_size_m: 5, values: [1, 2, 3], min_m: 1, max_m: 3 } })],
    ["more values than ncols × nrows", apiReliefJson({ grid: { ncols: 2, nrows: 2, cell_size_m: 5, values: [1, 2, 3, 4, 5], min_m: 1, max_m: 5 } })],
    ["a grid of one column", apiReliefJson({ grid: { ncols: 1, nrows: 2, cell_size_m: 5, values: [1, 2], min_m: 1, max_m: 2 } })],
    ["a non-integer ncols", apiReliefJson({ grid: { ncols: 2.5, nrows: 2, cell_size_m: 5, values: [1, 2, 3, 4, 5], min_m: 1, max_m: 5 } })],
    ["a string among the values", apiReliefJson({ grid: { ncols: 2, nrows: 2, cell_size_m: 5, values: [1, "2", 3, 4], min_m: 1, max_m: 4 } })],
    ["a NaN among the values", apiReliefJson({ grid: { ncols: 2, nrows: 2, cell_size_m: 5, values: [1, Number.NaN, 3, 4], min_m: 1, max_m: 4 } })],
    ["an outline of an unsupported type", apiReliefJson({ outline: { type: "LineString", coordinates: [[0, 38], [0.001, 38.001]] } })],
    ["an outline without coordinates", apiReliefJson({ outline: { type: "Polygon" } })],
    ["an outline with a non-numeric coordinate", apiReliefJson({ outline: { type: "Polygon", coordinates: [[["a", 38], [0, 38], [0, 38.1]]] } })],
    ["a non-numeric plot_area_m2", apiReliefJson({ plot_area_m2: "2905.99" })],
  ];

  it.each(cases)("%s -> ApiError 502 invalid_relief_response", (_name, raw) => {
    const error = invalid(raw);
    expect(error.status).toBe(502);
    expect(error.code).toBe("invalid_relief_response");
    expect(error.message).toBe("La respuesta del servidor no es válida. Inténtalo de nuevo.");
  });
});

describe("fetchReliefFromApi", () => {
  it("GET /api/cadastre/{reference}/relief with margin and max_side and returns the translated relief", async () => {
    const request = fakeRequest(apiReliefJson());
    const relief = await fetchReliefFromApi(OPTIONS, request);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(`/api/cadastre/${API_REFERENCE}/relief?margin=25&max_side=200`, { method: "GET" });
    expect(relief).toEqual(reliefFromResponse(apiReliefJson(), OPTIONS));
  });

  it.each([
    [0, 100],
    [10, 200],
    [50, 300],
    [100, 500],
  ] as const)("margin %i and side %i go in the URL", async (margin, maxSide) => {
    const request = fakeRequest(apiReliefJson());
    await fetchReliefFromApi({ reference: API_REFERENCE, margin, maxSide }, request);
    expect(request.mock.calls[0][0]).toBe(`/api/cadastre/${API_REFERENCE}/relief?margin=${margin}&max_side=${maxSide}`);
  });

  it("applies encodeURIComponent to the reference", async () => {
    const request = fakeRequest(apiReliefJson());
    await fetchReliefFromApi({ ...OPTIONS, reference: "AB/CD 12?x=1#" }, request);
    expect(request.mock.calls[0][0]).toBe(`/api/cadastre/${encodeURIComponent("AB/CD 12?x=1#")}/relief?margin=25&max_side=200`);
    expect(request.mock.calls[0][0]).not.toContain("AB/CD");
  });

  it.each([
    [422, "plot_reference_only", "La referencia catastral debe tener 20 caracteres."],
    [422, "invalid_relief_margin", "El margen debe ser 0, 10, 25, 50 o 100 metros."],
    [404, "plot_not_found", "No se encontró la parcela."],
    [503, "relief_unavailable", "No se pudo obtener el relieve. Puedes seguir sin el visor 3D."],
    [503, "cadastre_unavailable", "Catastro no está disponible."],
    [0, "network_error", "No se pudo conectar con el servidor."],
  ])("lets the ApiError %i %s through untouched", async (status, code, message) => {
    const failure = new ApiError(status, code, message);
    const request = jest.fn().mockRejectedValue(failure) as unknown as ApiRequest;
    await expect(fetchReliefFromApi(OPTIONS, request)).rejects.toBe(failure);
  });

  it("a malformed body rejects with invalid_relief_response", async () => {
    await expect(fetchReliefFromApi(OPTIONS, fakeRequest({ nope: true }))).rejects.toMatchObject({
      name: "ApiError",
      status: 502,
      code: "invalid_relief_response",
    });
    await expect(fetchReliefFromApi(OPTIONS, fakeRequest(undefined))).rejects.toMatchObject({ code: "invalid_relief_response" });
  });
});

describe("reliefFetcherFor", () => {
  it("a PRY-EJ-* sample project gets the synthetic terrain (the same function as fetchRelief)", async () => {
    const fetcher = reliefFetcherFor("PRY-EJ-001");
    const relief = await fetcher(OPTIONS);
    expect(relief).toEqual(await fetchRelief(OPTIONS));
    expect(relief.source).toBe("Relieve simulado");
  });

  it("a real project gets a fetcher that talks to the API", () => {
    expect(typeof reliefFetcherFor("PRY-2026-001")).toBe("function");
  });
});
