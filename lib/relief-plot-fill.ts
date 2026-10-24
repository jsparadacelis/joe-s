import type { Point } from "@/lib/relief";

export type Triangle = readonly [Point, Point, Point];

/** Opacity of the translucent plot fill (high enough to stand out from the terrain colour ramp). */
export const PLOT_FILL_OPACITY = 0.6;

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/**
 * Splits triangles (longest-edge bisection) until every edge is at most `maxEdge`.
 * The union is unchanged, so the fill keeps the exact plot shape, but it has enough vertices
 * to be lifted onto the terrain without gaps. Does not modify the input.
 */
export function subdivideTriangles(triangles: readonly Triangle[], maxEdge: number): Triangle[] {
  if (!(maxEdge > 0)) throw new RangeError("maxEdge must be positive");
  const result: Triangle[] = [];
  const pending: Triangle[] = [...triangles];
  for (let t = pending.pop(); t; t = pending.pop()) {
    const [a, b, c] = t;
    const edges: [number, Point, Point, Point][] = [
      [dist(a, b), a, b, c],
      [dist(b, c), b, c, a],
      [dist(c, a), c, a, b],
    ];
    const [length, p, q, r] = edges.reduce((best, e) => (e[0] > best[0] ? e : best));
    if (length <= maxEdge) {
      result.push(t);
      continue;
    }
    const m = mid(p, q);
    pending.push([p, m, r], [m, q, r]);
  }
  return result;
}
