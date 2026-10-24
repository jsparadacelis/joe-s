import {
  EXAGGERATIONS,
  MAX_SIDES,
  MARGINS,
  calculateViewWindow,
  fetchRelief,
  clipPolygon,
  type Margin,
  type MaxSide,
  type Relief,
} from "@/lib/relief";
import { polygonArea } from "@/lib/relief-readings";

const RESIDENTIAL = "1234567DG3413S0001AB";
const RURAL = "08187A005001230000OK";
const EPS = 1e-6;

describe("constants", () => {
  it("MARGINS, MAX_SIDES and EXAGGERATIONS", () => {
    expect([...MARGINS]).toEqual([0, 10, 25, 50, 100]);
    expect([...MAX_SIDES]).toEqual([100, 200, 300, 500]);
    expect([...EXAGGERATIONS]).toEqual([1, 2, 3]);
  });
});

describe("clipPolygon", () => {
  const viewWindow = [0, 0, 10, 10] as const;
  const key = (p: readonly (readonly [number, number])[]) =>
    p.map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`).sort();

  it("polygon inside the window: stays the same", () => {
    const polygon = [[2, 2], [8, 2], [8, 8], [2, 8]] as const;
    const r = clipPolygon(polygon, viewWindow);
    expect(key(r)).toEqual(key(polygon));
    expect(polygonArea(r)).toBeCloseTo(36, 9);
  });

  it("polygon outside the window: empty", () => {
    expect(clipPolygon([[20, 20], [30, 20], [30, 30], [20, 30]], viewWindow)).toEqual([]);
  });

  it("polygon cut on one side: new vertices appear on the edge", () => {
    const polygon = [[5, 2], [15, 2], [15, 8], [5, 8]] as const;
    const r = clipPolygon(polygon, viewWindow);
    expect(r.length).toBeGreaterThanOrEqual(4);
    expect(polygonArea(r)).toBeCloseTo(30, 6); // 5 × 6
    expect(polygonArea(r)).toBeLessThan(polygonArea(polygon));
    const onEdge = r.filter(([x]) => Math.abs(x - 10) < EPS);
    expect(onEdge.length).toBeGreaterThanOrEqual(2);
    for (const [x, y] of r) {
      expect(x).toBeGreaterThanOrEqual(-EPS);
      expect(x).toBeLessThanOrEqual(10 + EPS);
      expect(y).toBeGreaterThanOrEqual(-EPS);
      expect(y).toBeLessThanOrEqual(10 + EPS);
    }
  });

  it("polygon cut at a corner: the area is that of the intersection", () => {
    const r = clipPolygon([[5, 5], [15, 5], [15, 15], [5, 15]], viewWindow);
    expect(polygonArea(r)).toBeCloseTo(25, 6);
  });

  it("window containing the whole polygon: the area does not change", () => {
    const polygon = [[0, 0], [40, 0], [40, 30], [0, 30]] as const;
    const r = clipPolygon(polygon, [-100, -100, 100, 100]);
    expect(polygonArea(r)).toBeCloseTo(1200, 9);
  });

  it("window contained in the polygon: returns the window itself", () => {
    const r = clipPolygon([[-50, -50], [50, -50], [50, 50], [-50, 50]], viewWindow);
    expect(polygonArea(r)).toBeCloseTo(100, 6);
  });

  it("does not modify the input", () => {
    const polygon = [[5, 2], [15, 2], [15, 8], [5, 8]] as [number, number][];
    const copyOf = JSON.stringify(polygon);
    clipPolygon(polygon, viewWindow);
    expect(JSON.stringify(polygon)).toBe(copyOf);
  });
});

describe("calculateViewWindow", () => {
  const plot = [[0, 0], [40, 0], [40, 30], [0, 30]] as const;

  it("plot box + margin", () => {
    const { viewWindow, clamped } = calculateViewWindow(plot, 10, 200);
    expect(viewWindow).toEqual([-10, -10, 50, 40]);
    expect(clamped).toBe(false);
  });

  it.each([0, 10, 25, 50, 100])("margin %i m widens the box on all four sides", (m) => {
    const { viewWindow } = calculateViewWindow(plot, m, 500);
    expect(viewWindow).toEqual([0 - m, 0 - m, 40 + m, 30 + m]);
  });

  it("margin 0: exactly the plot box", () => {
    const { viewWindow, clamped } = calculateViewWindow(plot, 0, 100);
    expect(viewWindow).toEqual([0, 0, 40, 30]);
    expect(clamped).toBe(false);
  });

  it("if the width exceeds the maximum side, it is centred on the centroid (mean of vertices)", () => {
    // Vertices with mean x = 250 (differs from the area centroid, 300): the plan fixes the mean of vertices.
    const long = [[0, 0], [100, 0], [200, 0], [600, 0], [600, 10], [0, 10]] as const;
    const { viewWindow, clamped } = calculateViewWindow(long, 0, 200);
    expect(viewWindow[0]).toBeCloseTo(150, 9);
    expect(viewWindow[2]).toBeCloseTo(350, 9);
    expect(clamped).toBe(true);
  });

  it("large plot centred on the centroid: square window of the maximum side", () => {
    const large = [[-300, -200], [300, -200], [300, 200], [-300, 200]] as const;
    const { viewWindow, clamped } = calculateViewWindow(large, 25, 200);
    expect(viewWindow).toEqual([-100, -100, 100, 100]);
    expect(clamped).toBe(true);
  });

  it("dimension by dimension: only the one exceeding the side is limited", () => {
    const wide = [[0, 0], [400, 0], [400, 100], [0, 100]] as const;
    const { viewWindow, clamped } = calculateViewWindow(wide, 25, 200);
    expect(viewWindow[0]).toBeCloseTo(100, 9);
    expect(viewWindow[2]).toBeCloseTo(300, 9);
    expect(viewWindow[1]).toBeCloseTo(-25, 9); // height 150 < 200: box + margin
    expect(viewWindow[3]).toBeCloseTo(125, 9);
    expect(clamped).toBe(true);
  });

  it("«clamped» only if it was limited: a width equal to the maximum side does not count", () => {
    const exact = [[0, 0], [150, 0], [150, 150], [0, 150]] as const;
    const { viewWindow, clamped } = calculateViewWindow(exact, 25, 200); // 150 + 50 = 200
    expect(viewWindow).toEqual([-25, -25, 175, 175]);
    expect(clamped).toBe(false);
  });

  it("never returns more than the maximum side in any dimension", () => {
    for (const side of [100, 200, 300, 500]) {
      const { viewWindow } = calculateViewWindow([[0, 0], [1000, 0], [1000, 900], [0, 900]], 100, side);
      expect(viewWindow[2] - viewWindow[0]).toBeLessThanOrEqual(side + EPS);
      expect(viewWindow[3] - viewWindow[1]).toBeLessThanOrEqual(side + EPS);
    }
  });
});

describe("fetchRelief", () => {
  const options = (reference: string, margin: Margin = 25, maxSide: MaxSide = 200) => ({
    reference,
    margin,
    maxSide,
  });

  it.each([
    ["19 caracteres", "1234567DG3413S0001A"],
    ["21 caracteres", "1234567DG3413S0001ABC"],
    ["symbols", "1234567DG3413S00$1AB"],
    ["empty", ""],
    ["con espacios", "1234567DG3413 S001AB"],
  ])("invalid reference (%s): rejects with Error", async (_n, reference) => {
    await expect(fetchRelief(options(reference))).rejects.toBeInstanceOf(Error);
  });

  it("residential reference: consistent grid and complete data", async () => {
    const r = await fetchRelief(options(RESIDENTIAL));
    expect(r.reference).toBe(RESIDENTIAL);
    expect(r.columns).toBeGreaterThanOrEqual(2);
    expect(r.rows).toBeGreaterThanOrEqual(2);
    expect(r.heights).toHaveLength(r.columns * r.rows);
    expect(r.heights.every((h) => Number.isFinite(h))).toBe(true);
    const [x0, y0, x1, y1] = r.viewWindow;
    expect(x1).toBeGreaterThan(x0);
    expect(y1).toBeGreaterThan(y0);
    expect(r.perimeter.length).toBeGreaterThanOrEqual(3);
    for (const [x, y] of r.perimeter) {
      expect(x).toBeGreaterThanOrEqual(x0 - EPS);
      expect(x).toBeLessThanOrEqual(x1 + EPS);
      expect(y).toBeGreaterThanOrEqual(y0 - EPS);
      expect(y).toBeLessThanOrEqual(y1 + EPS);
    }
    expect(r.polygonSurface).toBeGreaterThan(0);
    expect(r.source.trim()).not.toBe("");
  });

  it("small plot with generous margin and side: neither clamped nor clipped", async () => {
    const r = await fetchRelief(options(RESIDENTIAL, 25, 200));
    expect(r.clamped).toBe(false);
    expect(r.plotClipped).toBe(false);
    expect(polygonArea(r.perimeter)).toBeCloseTo(r.polygonSurface, 0);
  });

  it("is deterministic: same reference and options, same result", async () => {
    const a = await fetchRelief(options(RESIDENTIAL));
    const b = await fetchRelief(options(RESIDENTIAL));
    expect(b).toEqual(a);
  });

  it("changes with another reference", async () => {
    const a = await fetchRelief(options(RESIDENTIAL));
    const b = await fetchRelief(options("7654321DG3413S0001ZZ"));
    expect(b.heights).not.toEqual(a.heights);
  });

  it("RGB-33 criterion: rural plot of ~9 ha with side 200 m and margin 25 m -> 200 × 200 m window, clamped", async () => {
    const r = await fetchRelief(options(RURAL, 25, 200));
    const [x0, y0, x1, y1] = r.viewWindow;
    expect(x1 - x0).toBeCloseTo(200, 6);
    expect(y1 - y0).toBeCloseTo(200, 6);
    expect(r.clamped).toBe(true);
    expect(r.polygonSurface).toBeGreaterThanOrEqual(70000);
    expect(r.heights).toHaveLength(r.columns * r.rows);
  });

  it("the rural one with side 100 m: still clamped, clipped, and its window is 100 × 100 m", async () => {
    const r = await fetchRelief(options(RURAL, 25, 100));
    expect(r.viewWindow[2] - r.viewWindow[0]).toBeCloseTo(100, 6);
    expect(r.viewWindow[3] - r.viewWindow[1]).toBeCloseTo(100, 6);
    expect(r.clamped).toBe(true);
    expect(r.plotClipped).toBe(true); // the window (1 ha) is much smaller than the plot (>= 7 ha)
    expect(polygonArea(r.perimeter)).toBeLessThan(r.polygonSurface);
  });

  it("the rural one with side 500 m: the window never exceeds the maximum side", async () => {
    const r = await fetchRelief(options(RURAL, 25, 500));
    expect(r.viewWindow[2] - r.viewWindow[0]).toBeLessThanOrEqual(500 + EPS);
    expect(r.viewWindow[3] - r.viewWindow[1]).toBeLessThanOrEqual(500 + EPS);
  });

  it.each([
    [RESIDENTIAL, "residential"],
    [RURAL, "rústica"],
  ])("consistency of clamped and plotClipped in all combinations (%s, %s)", async (reference) => {
    for (const margin of MARGINS) {
      for (const maxSide of MAX_SIDES) {
        const r: Relief = await fetchRelief({ reference, margin, maxSide });
        const area = polygonArea(r.perimeter);
        const label = `${reference} margen ${margin} lado ${maxSide}`;
        expect(r.viewWindow[2] - r.viewWindow[0]).toBeLessThanOrEqual(maxSide + EPS);
        expect(r.viewWindow[3] - r.viewWindow[1]).toBeLessThanOrEqual(maxSide + EPS);
        expect(area).toBeLessThanOrEqual(r.polygonSurface + 1);
        if (r.plotClipped) expect({ label, recorta: area < r.polygonSurface }).toEqual({ label, recorta: true });
        else expect({ label, diff: Math.abs(area - r.polygonSurface) < 1 }).toEqual({ label, diff: true });
        if (r.clamped) {
          // If the window was limited, some dimension measures exactly the maximum side.
          const w = r.viewWindow[2] - r.viewWindow[0];
          const h = r.viewWindow[3] - r.viewWindow[1];
          expect(Math.max(w, h)).toBeCloseTo(maxSide, 6);
        }
      }
    }
  });

  it("margin 0 on a small plot: the window is the plot box and does not clip it", async () => {
    const r = await fetchRelief(options(RESIDENTIAL, 0, 200));
    expect(r.plotClipped).toBe(false);
    expect(r.clamped).toBe(false);
  });

  it("a larger margin gives a larger (or equal) window with the same side", async () => {
    const small = await fetchRelief(options(RESIDENTIAL, 10, 500));
    const large = await fetchRelief(options(RESIDENTIAL, 100, 500));
    expect(large.viewWindow[2] - large.viewWindow[0]).toBeGreaterThan(small.viewWindow[2] - small.viewWindow[0]);
  });

  it("returns copies: mutating the result does not affect the next call", async () => {
    const a = await fetchRelief(options(RESIDENTIAL));
    const original = structuredClone(a);
    (a.heights as number[]).fill(-1);
    (a.perimeter as unknown as number[][]).push([0, 0]);
    (a.viewWindow as unknown as number[])[0] = 12345;
    const b = await fetchRelief(options(RESIDENTIAL));
    expect(b).toEqual(original);
  });
});
