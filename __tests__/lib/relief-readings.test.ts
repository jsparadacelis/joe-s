import { heightAt, polygonArea, calculateReadings, pointInPolygon } from "@/lib/relief-readings";
import { slopedPlane, reliefFromFunction } from "../helpers/relief-plane";

describe("polygonArea", () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]] as const;

  it("square of 10 × 10 = 100", () => {
    expect(polygonArea(square)).toBeCloseTo(100, 9);
  });

  it("does not depend on orientation (clockwise or anticlockwise): always >= 0", () => {
    expect(polygonArea([...square].reverse())).toBeCloseTo(100, 9);
    expect(polygonArea([...square].reverse())).toBeGreaterThanOrEqual(0);
  });

  it("right triangle with legs 6 and 4 = 12", () => {
    expect(polygonArea([[0, 0], [6, 0], [0, 4]])).toBeCloseTo(12, 9);
  });

  it("does not depend on the starting vertex or the position", () => {
    expect(polygonArea([[1000, 2000], [1010, 2000], [1010, 2010], [1000, 2010]])).toBeCloseTo(100, 6);
  });

  it("empty, a point or a line = 0", () => {
    expect(polygonArea([])).toBe(0);
    expect(polygonArea([[1, 1]])).toBe(0);
    expect(polygonArea([[0, 0], [5, 5]])).toBe(0);
  });
});

describe("pointInPolygon", () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]] as const;
  // Concave «U»: the central gap is open at the top.
  const u = [[0, 0], [30, 0], [30, 30], [20, 30], [20, 10], [10, 10], [10, 30], [0, 30]] as const;

  it("inside and outside a square", () => {
    expect(pointInPolygon(square, 5, 5)).toBe(true);
    expect(pointInPolygon(square, 11, 5)).toBe(false);
    expect(pointInPolygon(square, -1, 5)).toBe(false);
    expect(pointInPolygon(square, 5, 11)).toBe(false);
  });

  it("concave polygon: the gap is outside and the arms inside", () => {
    expect(pointInPolygon(u, 15, 20)).toBe(false);
    expect(pointInPolygon(u, 5, 20)).toBe(true);
    expect(pointInPolygon(u, 25, 20)).toBe(true);
    expect(pointInPolygon(u, 15, 5)).toBe(true);
  });

  it("empty polygon: never contains anything", () => {
    expect(pointInPolygon([], 0, 0)).toBe(false);
  });
});

describe("heightAt (bilinear interpolation, row 0 = north)", () => {
  // Window [0,0,10,10], 2 × 2 grid. Row 0 = north (y = 10).
  //   (0,10)=10  (10,10)=20
  //   (0,0) =30  (10,0) =40
  const rel = { viewWindow: [0, 0, 10, 10] as const, columns: 2, rows: 2, heights: [10, 20, 30, 40] };

  it("exact at the four corners", () => {
    expect(heightAt(rel, 0, 10)).toBeCloseTo(10, 9);
    expect(heightAt(rel, 10, 10)).toBeCloseTo(20, 9);
    expect(heightAt(rel, 0, 0)).toBeCloseTo(30, 9);
    expect(heightAt(rel, 10, 0)).toBeCloseTo(40, 9);
  });

  it("exact at the centre and at the midpoints of the sides", () => {
    expect(heightAt(rel, 5, 5)).toBeCloseTo(25, 9);
    expect(heightAt(rel, 5, 10)).toBeCloseTo(15, 9);
    expect(heightAt(rel, 5, 0)).toBeCloseTo(35, 9);
    expect(heightAt(rel, 0, 5)).toBeCloseTo(20, 9);
    expect(heightAt(rel, 10, 5)).toBeCloseTo(30, 9);
  });

  it("interpolates bilinearly at any point", () => {
    // u = 0.25 (east), v = 0.5 (north to south): north row 10+2.5=12.5, south row 30+2.5=32.5 -> 22.5
    expect(heightAt(rel, 2.5, 5)).toBeCloseTo(22.5, 9);
  });

  it("with a 3 × 3 grid it uses the right cell", () => {
    const r3 = {
      viewWindow: [0, 0, 20, 20] as const,
      columns: 3,
      rows: 3,
      // north -> south
      heights: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    };
    expect(heightAt(r3, 10, 10)).toBeCloseTo(5, 9);
    expect(heightAt(r3, 20, 20)).toBeCloseTo(3, 9);
    expect(heightAt(r3, 0, 0)).toBeCloseTo(7, 9);
    expect(heightAt(r3, 15, 5)).toBeCloseTo(7, 9); // between 5,6,8,9 at the centre of the SE cell
  });

  it("outside the window it is clamped to the edge", () => {
    expect(heightAt(rel, -50, 50)).toBeCloseTo(10, 9);
    expect(heightAt(rel, 50, 50)).toBeCloseTo(20, 9);
    expect(heightAt(rel, -5, -5)).toBeCloseTo(30, 9);
    expect(heightAt(rel, 99, -99)).toBeCloseTo(40, 9);
    expect(heightAt(rel, 5, 99)).toBeCloseTo(15, 9);
  });
});

describe("calculateReadings", () => {
  it("sloped plane h = 100 + 0.1·x: mean slope ≈ 10 %", () => {
    const l = calculateReadings(slopedPlane());
    expect(l).not.toBeNull();
    expect(l!.meanSlope).toBeGreaterThan(9.8);
    expect(l!.meanSlope).toBeLessThan(10.2);
  });

  it("minimum and maximum height consistent with the perimeter extremes (61 × 61 mesh)", () => {
    const l = calculateReadings(slopedPlane())!;
    // Perimeter x ∈ [20, 80] -> h ∈ [102, 108]; the mesh (step 100/60 ≈ 1.67 m) stays inside the perimeter.
    expect(l.minHeight).toBeGreaterThanOrEqual(102 - 1e-9);
    expect(l.minHeight).toBeLessThan(102.3);
    expect(l.maxHeight).toBeLessThanOrEqual(108 + 1e-9);
    expect(l.maxHeight).toBeGreaterThan(107.7);
  });

  it("elevation range = maximum − minimum", () => {
    const l = calculateReadings(slopedPlane())!;
    expect(l.elevationRange).toBeCloseTo(l.maxHeight - l.minHeight, 9);
    expect(l.elevationRange).toBeGreaterThan(5.4);
    expect(l.elevationRange).toBeLessThan(6);
  });

  it("surface = polygonSurface (that of the full perimeter, not the clipped one)", () => {
    const l = calculateReadings(slopedPlane({ polygonSurface: 98765.4 }))!;
    expect(l.surface).toBe(98765.4);
  });

  it("horizontal plane: slope 0 and elevation range 0", () => {
    const l = calculateReadings(reliefFromFunction(() => 250))!;
    expect(l.meanSlope).toBeCloseTo(0, 9);
    expect(l.elevationRange).toBeCloseTo(0, 9);
    expect(l.minHeight).toBeCloseTo(250, 9);
    expect(l.maxHeight).toBeCloseTo(250, 9);
  });

  it("plane sloping north: the slope is measured in any direction", () => {
    const l = calculateReadings(reliefFromFunction((_x, y) => 50 + 0.05 * y))!;
    expect(l.meanSlope).toBeGreaterThan(4.8);
    expect(l.meanSlope).toBeLessThan(5.2);
  });

  it("perimeter outside the window -> null", () => {
    const outside = slopedPlane({ perimeter: [[200, 200], [300, 200], [300, 300], [200, 300]] });
    expect(calculateReadings(outside)).toBeNull();
  });

  it("empty perimeter -> null", () => {
    expect(calculateReadings(slopedPlane({ perimeter: [] }))).toBeNull();
  });

  it("only counts what falls inside the perimeter", () => {
    const left = calculateReadings(slopedPlane({ perimeter: [[20, 20], [50, 20], [50, 80], [20, 80]] }))!;
    const right = calculateReadings(slopedPlane({ perimeter: [[50, 20], [80, 20], [80, 80], [50, 80]] }))!;
    expect(left.maxHeight).toBeLessThanOrEqual(105 + 1e-9);
    expect(right.minHeight).toBeGreaterThanOrEqual(105 - 1e-9);
    expect(left.maxHeight).toBeLessThan(right.maxHeight);
    expect(left.minHeight).toBeLessThan(right.minHeight);
    // The elevation range of each half is smaller than that of the whole perimeter.
    const integer = calculateReadings(slopedPlane())!;
    expect(left.elevationRange).toBeLessThan(integer.elevationRange);
    expect(right.elevationRange).toBeLessThan(integer.elevationRange);
  });

  it("does not modify the input relief", () => {
    const rel = slopedPlane();
    const copyOf = JSON.stringify(rel);
    calculateReadings(rel);
    expect(JSON.stringify(rel)).toBe(copyOf);
  });
});
