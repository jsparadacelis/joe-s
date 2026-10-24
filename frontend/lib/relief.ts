import { isValidCadastralReference } from "@/lib/technical-data";
import { polygonArea } from "@/lib/relief-readings";

export type Margin = 0 | 10 | 25 | 50 | 100;
export type MaxSide = 100 | 200 | 300 | 500;
export type Exaggeration = 1 | 2 | 3;
/** Metres in local coordinates (x east, y north). */
export type Point = readonly [number, number];
/** [x0, y0, x1, y1] in metres. */
export type ViewWindow = readonly [number, number, number, number];

export interface ReliefOptions {
  reference: string;
  margin: Margin;
  maxSide: MaxSide;
}

export interface Relief {
  reference: string;
  /** The grid covers exactly the window. */
  viewWindow: ViewWindow;
  columns: number;
  rows: number;
  /** rows × columns, row 0 = north (maximum y), reading order. */
  heights: readonly number[];
  /** Plot perimeter clipped to the window. */
  perimeter: readonly Point[];
  /** m² of the full (unclipped) perimeter. */
  polygonSurface: number;
  /** The window was limited to the maximum side. */
  clamped: boolean;
  /** The perimeter was cut by the window. */
  plotClipped: boolean;
  source: string;
}

export const MARGINS: readonly Margin[] = [0, 10, 25, 50, 100];
export const MAX_SIDES: readonly MaxSide[] = [100, 200, 300, 500];
export const EXAGGERATIONS: readonly Exaggeration[] = [1, 2, 3];

// ---------------------------------------------------------------------------
// Sample layer, REPLACEABLE by the relief API client (RGB-33).
// Everything that follows up to `fetchRelief` is fictitious and deterministic: the
// real service will decide the window, request the IGN's MDT only for that window
// and return the grid, the clipped INSPIRE perimeter and the indicators.
// The front end never calls external services.
// ---------------------------------------------------------------------------

/** Polygon clipped to a rectangle (Sutherland–Hodgman). Does not modify the input. */
export function clipPolygon(polygon: readonly Point[], viewWindow: ViewWindow): Point[] {
  const [x0, y0, x1, y1] = viewWindow;
  const inside = [
    (p: Point) => p[0] >= x0,
    (p: Point) => p[0] <= x1,
    (p: Point) => p[1] >= y0,
    (p: Point) => p[1] <= y1,
  ];
  const cut = (a: Point, b: Point, side: number): Point => {
    switch (side) {
      case 0: return [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])];
      case 1: return [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])];
      case 2: return [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0];
      default: return [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1];
    }
  };

  let output: Point[] = polygon.map(([x, y]) => [x, y]);
  inside.forEach((isInside, side) => {
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i];
      const b = input[(i + 1) % input.length];
      const ia = isInside(a);
      const ib = isInside(b);
      if (ia && ib) output.push(b);
      else if (ia && !ib) output.push(cut(a, b, side));
      else if (!ia && ib) output.push(cut(a, b, side), b);
    }
  });
  return output;
}

/**
 * Plot box + margin. If a dimension exceeds the maximum side, it is centred
 * on the centroid (mean of vertices) with that side; `clamped` tells whether any was limited.
 */
export function calculateViewWindow(
  perimeter: readonly Point[],
  margin: number,
  maxSide: number,
): { viewWindow: [number, number, number, number]; clamped: boolean } {
  const xs = perimeter.map((p) => p[0]);
  const ys = perimeter.map((p) => p[1]);
  const center = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const axis = (values: number[]): [number, number, boolean] => {
    const min = Math.min(...values) - margin;
    const max = Math.max(...values) + margin;
    if (max - min <= maxSide) return [min, max, false];
    const c = center(values);
    return [c - maxSide / 2, c + maxSide / 2, true];
  };
  const [x0, x1, limitedX] = axis(xs);
  const [y0, y1, limitedY] = axis(ys);
  return { viewWindow: [x0, y0, x1, y1], clamped: limitedX || limitedY };
}

/** Deterministic pseudo-random generator from a text (FNV-1a hash + mixing). */
function random(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Step of the simulated grid, in m (like the IGN's 5 m MDT). */
const GRID_STEP = 5;

interface Terrain {
  perimeter: Point[];
  height: (x: number, y: number) => number;
}

/** Simulated plot and terrain: rural (~8-10 ha) if the reference is 5 digits + «A»; otherwise residential. */
function simulateTerrain(reference: string): Terrain {
  const rnd = random(reference);
  const rural = /^\d{5}A/.test(reference);
  const vertices = 5 + Math.floor(rnd() * 4);
  const rotation = rnd() * Math.PI;
  const raw: Point[] = Array.from({ length: vertices }, (_, i) => {
    const angle = rotation + (i / vertices) * Math.PI * 2;
    const radius = 0.75 + rnd() * 0.45;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });
  const target = rural ? 80000 + rnd() * 20000 : 400 + rnd() * 800;
  const scale = Math.sqrt(target / polygonArea(raw));
  const perimeter = raw.map(([x, y]): Point => [x * scale, y * scale]);

  const slopeX = (rnd() - 0.5) * 0.24;
  const slopeY = (rnd() - 0.5) * 0.24;
  const amplitude = 2 + rnd() * (rural ? 14 : 5);
  const wave1 = 30 + rnd() * 60;
  const wave2 = 30 + rnd() * 60;
  const phase = rnd() * 6;
  const base = 80 + rnd() * 400;
  return {
    perimeter,
    height: (x, y) =>
      base +
      x * slopeX +
      y * slopeY +
      amplitude * Math.sin(x / wave1 + phase) * Math.cos(y / wave2) +
      0.6 * Math.sin(x / 7) * Math.sin(y / 9),
  };
}

/**
 * Relief for a cadastral reference. Rejects with Error if the reference is not valid.
 * Replaceable by the API client (RGB-33) keeping this signature.
 */
export async function fetchRelief({ reference, margin, maxSide }: ReliefOptions): Promise<Relief> {
  if (!isValidCadastralReference(reference)) {
    throw new Error("La referencia catastral debe tener 20 caracteres.");
  }
  const ref = reference.trim().toUpperCase();
  const { perimeter, height } = simulateTerrain(ref);
  const { viewWindow, clamped } = calculateViewWindow(perimeter, margin, maxSide);
  const [x0, y0, x1, y1] = viewWindow;
  const columns = Math.max(2, Math.round((x1 - x0) / GRID_STEP) + 1);
  const rows = Math.max(2, Math.round((y1 - y0) / GRID_STEP) + 1);

  const heights: number[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      heights.push(height(x0 + (i * (x1 - x0)) / (columns - 1), y1 - (j * (y1 - y0)) / (rows - 1)));
    }
  }

  const polygonSurface = polygonArea(perimeter);
  const clip = clipPolygon(perimeter, viewWindow);
  return {
    reference: ref,
    viewWindow: [x0, y0, x1, y1],
    columns,
    rows,
    heights,
    perimeter: clip,
    polygonSurface,
    clamped,
    plotClipped: polygonArea(clip) < polygonSurface - 0.5,
    source: "Relieve simulado",
  };
}
