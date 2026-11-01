/**
 * Relief API client (RGB-52): `GET /api/cadastre/{reference}/relief` (RGB-33).
 * Translates the server response into the viewer's `Relief`. The grid covers exactly the degree box of `window`,
 * so lon/lat are projected linearly onto it (origin at the south-west corner) to make the perimeter match the mesh.
 * Fictitious `PRY-EJ-*` projects keep the synthetic terrain and never call the API.
 */
import { ApiError, request as defaultRequest, type ApiRequest } from "@/lib/api";
import { isSampleProject } from "@/lib/projects";
import { fetchRelief, type Point, type Relief, type ReliefOptions } from "@/lib/relief";

export const RELIEF_SOURCE = "MDT 5 m, IGN";

const INVALID_RESPONSE = "La respuesta del servidor no es válida. Inténtalo de nuevo.";

const invalidResponse = () => new ApiError(502, "invalid_relief_response", INVALID_RESPONSE);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

type Position = readonly [number, number];

function readPosition(raw: unknown): Position {
  if (!Array.isArray(raw) || raw.length < 2 || !isFiniteNumber(raw[0]) || !isFiniteNumber(raw[1])) throw invalidResponse();
  return [raw[0], raw[1]];
}

function readRing(raw: unknown): Position[] {
  if (!Array.isArray(raw) || raw.length === 0) throw invalidResponse();
  return raw.map(readPosition);
}

/** Exterior ring of a Polygon (`coordinates[0]`). */
function readPolygonRing(coordinates: unknown): Position[] {
  if (!Array.isArray(coordinates) || coordinates.length === 0) throw invalidResponse();
  return readRing(coordinates[0]);
}

function ringArea(ring: readonly Position[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    sum += x0 * y1 - x1 * y0;
  }
  return Math.abs(sum) / 2;
}

/** Exterior ring of the outline (largest part of a MultiPolygon); `null` when the server sent no outline. */
function readOutline(raw: unknown): Position[] | null {
  if (raw === null || raw === undefined) return null;
  if (!isRecord(raw)) throw invalidResponse();
  if (raw.type === "Polygon") return readPolygonRing(raw.coordinates);
  if (raw.type === "MultiPolygon") {
    if (!Array.isArray(raw.coordinates) || raw.coordinates.length === 0) throw invalidResponse();
    const rings = raw.coordinates.map(readPolygonRing);
    return rings.reduce((best, ring) => (ringArea(ring) > ringArea(best) ? ring : best));
  }
  throw invalidResponse();
}

/** Replaces `null` cells with the mean of their known neighbours, growing inwards pass by pass. */
function fillNoData(values: ReadonlyArray<number | null>, columns: number, rows: number): number[] {
  let current = [...values];
  for (;;) {
    const missing = current.flatMap((v, i) => (v === null ? [i] : []));
    if (missing.length === 0) return current as number[];
    const next = [...current];
    for (const index of missing) {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const known: number[] = [];
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= rows || c < 0 || c >= columns) continue;
        const value = current[r * columns + c];
        if (value !== null) known.push(value);
      }
      if (known.length > 0) next[index] = known.reduce((a, b) => a + b, 0) / known.length;
    }
    current = next;
  }
}

/** Pure translation of the server response; throws `ApiError(502, "invalid_relief_response")` if malformed. */
export function reliefFromResponse(raw: unknown, options: ReliefOptions): Relief {
  if (!isRecord(raw) || !isRecord(raw.window) || !isRecord(raw.grid)) throw invalidResponse();
  const { min_lon, min_lat, max_lon, max_lat, width_m, height_m } = raw.window;
  if (
    !isFiniteNumber(min_lon) ||
    !isFiniteNumber(min_lat) ||
    !isFiniteNumber(max_lon) ||
    !isFiniteNumber(max_lat) ||
    !isFiniteNumber(width_m) ||
    !isFiniteNumber(height_m) ||
    max_lon <= min_lon ||
    max_lat <= min_lat ||
    width_m <= 0 ||
    height_m <= 0
  ) {
    throw invalidResponse();
  }

  const { ncols, nrows, values } = raw.grid;
  if (
    typeof ncols !== "number" ||
    typeof nrows !== "number" ||
    !Number.isInteger(ncols) ||
    !Number.isInteger(nrows) ||
    ncols < 2 ||
    nrows < 2 ||
    !Array.isArray(values) ||
    values.length !== ncols * nrows ||
    !values.every((v) => v === null || isFiniteNumber(v))
  ) {
    throw invalidResponse();
  }
  const cells = values as Array<number | null>;
  const noDataCells = cells.filter((v) => v === null).length;
  if (noDataCells === cells.length) throw invalidResponse();

  if (!isFiniteNumber(raw.plot_area_m2)) throw invalidResponse();

  const ring = readOutline(raw.outline);
  const project = ([lon, lat]: Position): Point => [
    ((lon - min_lon) / (max_lon - min_lon)) * width_m,
    ((lat - min_lat) / (max_lat - min_lat)) * height_m,
  ];
  let perimeter: Point[] = ring ? ring.map(project) : [];
  if (perimeter.length > 1) {
    const [first, last] = [perimeter[0], perimeter[perimeter.length - 1]];
    if (first[0] === last[0] && first[1] === last[1]) perimeter = perimeter.slice(0, -1);
  }

  return {
    // The server answers with the 14-character parcel reference; the viewer needs the 20 requested to ask again.
    reference: options.reference,
    viewWindow: [0, 0, width_m, height_m],
    columns: ncols,
    rows: nrows,
    heights: noDataCells === 0 ? (cells as number[]) : fillNoData(cells, ncols, nrows),
    perimeter,
    polygonSurface: raw.plot_area_m2,
    clamped: raw.clipped === true,
    plotClipped: raw.parcel_clipped === true,
    source: RELIEF_SOURCE,
    noDataCells,
  };
}

export async function fetchReliefFromApi(options: ReliefOptions, request: ApiRequest = defaultRequest): Promise<Relief> {
  const { reference, margin, maxSide } = options;
  const raw = await request(`/api/cadastre/${encodeURIComponent(reference)}/relief?margin=${margin}&max_side=${maxSide}`, {
    method: "GET",
  });
  return reliefFromResponse(raw, options);
}

/** Sample projects use the synthetic terrain; the rest, the service. */
export function reliefFetcherFor(code: string): (options: ReliefOptions) => Promise<Relief> {
  return isSampleProject(code) ? fetchRelief : (options) => fetchReliefFromApi(options);
}
