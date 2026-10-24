import type { Point, Relief } from "@/lib/relief";

/** Readings of the visible plot. The slope is expressed in %. */
export interface Readings {
  surface: number;
  minHeight: number;
  maxHeight: number;
  elevationRange: number;
  meanSlope: number;
}

/** Divisions per axis of the sampling (61 × 61 points) and step of the central differences, in m. */
const DIVISIONS = 60;
const GRADIENT_STEP = 2;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Terrain height at (x, y) by bilinear interpolation. Row 0 = north.
 * Outside the window it is clamped to the edge.
 */
export function heightAt(
  relief: Pick<Relief, "viewWindow" | "columns" | "rows" | "heights">,
  x: number,
  y: number,
): number {
  const { viewWindow, columns, rows, heights } = relief;
  const [x0, y0, x1, y1] = viewWindow;
  const u = clamp(((x - x0) / (x1 - x0)) * (columns - 1), 0, columns - 1);
  const v = clamp(((y1 - y) / (y1 - y0)) * (rows - 1), 0, rows - 1);
  const i = Math.min(Math.floor(u), columns - 2);
  const j = Math.min(Math.floor(v), rows - 2);
  const fu = u - i;
  const fv = v - j;
  const a = heights[j * columns + i];
  const b = heights[j * columns + i + 1];
  const c = heights[(j + 1) * columns + i];
  const d = heights[(j + 1) * columns + i + 1];
  return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv;
}

/** Polygon area (shoelace formula); always >= 0. */
export function polygonArea(polygon: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x, y] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    sum += x * y2 - x2 * y;
  }
  return Math.abs(sum) / 2;
}

/** Point inside the polygon (even-odd rule). */
export function pointInPolygon(polygon: readonly Point[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Readings inside the clipped perimeter; `null` if there are no samples inside. */
export function calculateReadings(relief: Relief): Readings | null {
  const [x0, y0, x1, y1] = relief.viewWindow;
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  let gradientSum = 0;
  let samples = 0;

  for (let j = 0; j <= DIVISIONS; j++) {
    for (let i = 0; i <= DIVISIONS; i++) {
      const x = x0 + (i * (x1 - x0)) / DIVISIONS;
      const y = y0 + (j * (y1 - y0)) / DIVISIONS;
      if (!pointInPolygon(relief.perimeter, x, y)) continue;
      const h = heightAt(relief, x, y);
      minHeight = Math.min(minHeight, h);
      maxHeight = Math.max(maxHeight, h);
      const gx = (heightAt(relief, x + GRADIENT_STEP, y) - heightAt(relief, x - GRADIENT_STEP, y)) / (2 * GRADIENT_STEP);
      const gy = (heightAt(relief, x, y + GRADIENT_STEP) - heightAt(relief, x, y - GRADIENT_STEP)) / (2 * GRADIENT_STEP);
      gradientSum += Math.hypot(gx, gy);
      samples++;
    }
  }
  if (samples === 0) return null;
  return {
    surface: relief.polygonSurface,
    minHeight,
    maxHeight,
    elevationRange: maxHeight - minHeight,
    meanSlope: (gradientSum / samples) * 100,
  };
}
