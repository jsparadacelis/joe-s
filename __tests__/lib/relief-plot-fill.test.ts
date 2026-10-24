import { PLOT_FILL_OPACITY, subdivideTriangles, type Triangle } from "@/lib/relief-plot-fill";
import { polygonArea } from "@/lib/relief-readings";

const area = (t: Triangle) => polygonArea(t);
const maxEdge = (t: Triangle) => Math.max(...t.map((p, i) => Math.hypot(p[0] - t[(i + 1) % 3][0], p[1] - t[(i + 1) % 3][1])));

describe("subdivideTriangles", () => {
  const sliver: Triangle = [[0, 0], [100, 0], [100, 2]];

  it("keeps the total area and splits until every edge fits", () => {
    const result = subdivideTriangles([sliver], 5);
    expect(result.length).toBeGreaterThan(1);
    expect(result.reduce((sum, t) => sum + area(t), 0)).toBeCloseTo(area(sliver), 6);
    for (const t of result) expect(maxEdge(t)).toBeLessThanOrEqual(5 + 1e-9);
  });

  it("leaves small triangles untouched", () => {
    const small: Triangle = [[0, 0], [1, 0], [0, 1]];
    expect(subdivideTriangles([small], 5)).toEqual([small]);
  });

  it("keeps every vertex inside the original bounding box and does not mutate the input", () => {
    const copy = JSON.stringify(sliver);
    const result = subdivideTriangles([sliver], 3);
    expect(JSON.stringify(sliver)).toBe(copy);
    for (const t of result) for (const [x, y] of t) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(2);
    }
  });

  it("rejects a non-positive edge limit", () => {
    expect(() => subdivideTriangles([sliver], 0)).toThrow(RangeError);
  });

  it("fill opacity is a valid translucent value", () => {
    expect(PLOT_FILL_OPACITY).toBeGreaterThan(0);
    expect(PLOT_FILL_OPACITY).toBeLessThan(1);
    // Do not raise it: a denser fill hides the height ramp and flattens large plots into one tone.
    expect(PLOT_FILL_OPACITY).toBeLessThanOrEqual(0.45);
  });
});
