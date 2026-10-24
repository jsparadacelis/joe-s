import { heightAt, polygonArea, calculateReadings, pointInPolygon } from "@/lib/relief-readings";
import { slopedPlane, reliefFromFunction } from "../helpers/relief-plane";

describe("areaPoligono", () => {
  const cuadrado = [[0, 0], [10, 0], [10, 10], [0, 10]] as const;

  it("cuadrado de 10 × 10 = 100", () => {
    expect(polygonArea(cuadrado)).toBeCloseTo(100, 9);
  });

  it("no depende de la orientación (horaria o antihoraria): siempre >= 0", () => {
    expect(polygonArea([...cuadrado].reverse())).toBeCloseTo(100, 9);
    expect(polygonArea([...cuadrado].reverse())).toBeGreaterThanOrEqual(0);
  });

  it("triángulo rectángulo de catetos 6 y 4 = 12", () => {
    expect(polygonArea([[0, 0], [6, 0], [0, 4]])).toBeCloseTo(12, 9);
  });

  it("no depende del vértice de partida ni de la posición", () => {
    expect(polygonArea([[1000, 2000], [1010, 2000], [1010, 2010], [1000, 2010]])).toBeCloseTo(100, 6);
  });

  it("vacío, un punto o una recta = 0", () => {
    expect(polygonArea([])).toBe(0);
    expect(polygonArea([[1, 1]])).toBe(0);
    expect(polygonArea([[0, 0], [5, 5]])).toBe(0);
  });
});

describe("puntoEnPoligono", () => {
  const cuadrado = [[0, 0], [10, 0], [10, 10], [0, 10]] as const;
  // «U» cóncava: el hueco central está abierto por arriba.
  const u = [[0, 0], [30, 0], [30, 30], [20, 30], [20, 10], [10, 10], [10, 30], [0, 30]] as const;

  it("dentro y fuera de un cuadrado", () => {
    expect(pointInPolygon(cuadrado, 5, 5)).toBe(true);
    expect(pointInPolygon(cuadrado, 11, 5)).toBe(false);
    expect(pointInPolygon(cuadrado, -1, 5)).toBe(false);
    expect(pointInPolygon(cuadrado, 5, 11)).toBe(false);
  });

  it("polígono cóncavo: el hueco queda fuera y los brazos dentro", () => {
    expect(pointInPolygon(u, 15, 20)).toBe(false);
    expect(pointInPolygon(u, 5, 20)).toBe(true);
    expect(pointInPolygon(u, 25, 20)).toBe(true);
    expect(pointInPolygon(u, 15, 5)).toBe(true);
  });

  it("polígono vacío: nunca contiene nada", () => {
    expect(pointInPolygon([], 0, 0)).toBe(false);
  });
});

describe("alturaEn (interpolación bilineal, fila 0 = norte)", () => {
  // Ventana [0,0,10,10], rejilla 2 × 2. Fila 0 = norte (y = 10).
  //   (0,10)=10  (10,10)=20
  //   (0,0) =30  (10,0) =40
  const rel = { viewWindow: [0, 0, 10, 10] as const, columns: 2, rows: 2, heights: [10, 20, 30, 40] };

  it("exacta en las cuatro esquinas", () => {
    expect(heightAt(rel, 0, 10)).toBeCloseTo(10, 9);
    expect(heightAt(rel, 10, 10)).toBeCloseTo(20, 9);
    expect(heightAt(rel, 0, 0)).toBeCloseTo(30, 9);
    expect(heightAt(rel, 10, 0)).toBeCloseTo(40, 9);
  });

  it("exacta en el centro y en los puntos medios de los lados", () => {
    expect(heightAt(rel, 5, 5)).toBeCloseTo(25, 9);
    expect(heightAt(rel, 5, 10)).toBeCloseTo(15, 9);
    expect(heightAt(rel, 5, 0)).toBeCloseTo(35, 9);
    expect(heightAt(rel, 0, 5)).toBeCloseTo(20, 9);
    expect(heightAt(rel, 10, 5)).toBeCloseTo(30, 9);
  });

  it("interpola de forma bilineal en un punto cualquiera", () => {
    // u = 0.25 (este), v = 0.5 (de norte a sur): fila norte 10+2.5=12.5, fila sur 30+2.5=32.5 -> 22.5
    expect(heightAt(rel, 2.5, 5)).toBeCloseTo(22.5, 9);
  });

  it("con una rejilla 3 × 3 usa la celda correcta", () => {
    const r3 = {
      viewWindow: [0, 0, 20, 20] as const,
      columns: 3,
      rows: 3,
      // norte -> sur
      heights: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    };
    expect(heightAt(r3, 10, 10)).toBeCloseTo(5, 9);
    expect(heightAt(r3, 20, 20)).toBeCloseTo(3, 9);
    expect(heightAt(r3, 0, 0)).toBeCloseTo(7, 9);
    expect(heightAt(r3, 15, 5)).toBeCloseTo(7, 9); // entre 5,6,8,9 en el centro de la celda SE
  });

  it("fuera de la ventana se sujeta al borde", () => {
    expect(heightAt(rel, -50, 50)).toBeCloseTo(10, 9);
    expect(heightAt(rel, 50, 50)).toBeCloseTo(20, 9);
    expect(heightAt(rel, -5, -5)).toBeCloseTo(30, 9);
    expect(heightAt(rel, 99, -99)).toBeCloseTo(40, 9);
    expect(heightAt(rel, 5, 99)).toBeCloseTo(15, 9);
  });
});

describe("calcularLecturas", () => {
  it("plano inclinado h = 100 + 0,1·x: pendiente media ≈ 10 %", () => {
    const l = calculateReadings(slopedPlane());
    expect(l).not.toBeNull();
    expect(l!.meanSlope).toBeGreaterThan(9.8);
    expect(l!.meanSlope).toBeLessThan(10.2);
  });

  it("altitud mínima y máxima coherentes con los extremos del perímetro (malla de 61 × 61)", () => {
    const l = calculateReadings(slopedPlane())!;
    // Perímetro x ∈ [20, 80] -> h ∈ [102, 108]; la malla (paso 100/60 ≈ 1,67 m) queda dentro del perímetro.
    expect(l.minHeight).toBeGreaterThanOrEqual(102 - 1e-9);
    expect(l.minHeight).toBeLessThan(102.3);
    expect(l.maxHeight).toBeLessThanOrEqual(108 + 1e-9);
    expect(l.maxHeight).toBeGreaterThan(107.7);
  });

  it("desnivel = máxima − mínima", () => {
    const l = calculateReadings(slopedPlane())!;
    expect(l.elevationRange).toBeCloseTo(l.maxHeight - l.minHeight, 9);
    expect(l.elevationRange).toBeGreaterThan(5.4);
    expect(l.elevationRange).toBeLessThan(6);
  });

  it("superficie = superficiePoligono (la del perímetro completo, no la recortada)", () => {
    const l = calculateReadings(slopedPlane({ polygonSurface: 98765.4 }))!;
    expect(l.surface).toBe(98765.4);
  });

  it("plano horizontal: pendiente 0 y desnivel 0", () => {
    const l = calculateReadings(reliefFromFunction(() => 250))!;
    expect(l.meanSlope).toBeCloseTo(0, 9);
    expect(l.elevationRange).toBeCloseTo(0, 9);
    expect(l.minHeight).toBeCloseTo(250, 9);
    expect(l.maxHeight).toBeCloseTo(250, 9);
  });

  it("plano inclinado hacia el norte: la pendiente se mide en cualquier dirección", () => {
    const l = calculateReadings(reliefFromFunction((_x, y) => 50 + 0.05 * y))!;
    expect(l.meanSlope).toBeGreaterThan(4.8);
    expect(l.meanSlope).toBeLessThan(5.2);
  });

  it("perímetro fuera de la ventana -> null", () => {
    const outside = slopedPlane({ perimeter: [[200, 200], [300, 200], [300, 300], [200, 300]] });
    expect(calculateReadings(outside)).toBeNull();
  });

  it("perímetro vacío -> null", () => {
    expect(calculateReadings(slopedPlane({ perimeter: [] }))).toBeNull();
  });

  it("solo cuenta lo que cae dentro del perímetro", () => {
    const left = calculateReadings(slopedPlane({ perimeter: [[20, 20], [50, 20], [50, 80], [20, 80]] }))!;
    const right = calculateReadings(slopedPlane({ perimeter: [[50, 20], [80, 20], [80, 80], [50, 80]] }))!;
    expect(left.maxHeight).toBeLessThanOrEqual(105 + 1e-9);
    expect(right.minHeight).toBeGreaterThanOrEqual(105 - 1e-9);
    expect(left.maxHeight).toBeLessThan(right.maxHeight);
    expect(left.minHeight).toBeLessThan(right.minHeight);
    // El desnivel de cada mitad es menor que el del perímetro entero.
    const integer = calculateReadings(slopedPlane())!;
    expect(left.elevationRange).toBeLessThan(integer.elevationRange);
    expect(right.elevationRange).toBeLessThan(integer.elevationRange);
  });

  it("no modifica el relieve de entrada", () => {
    const rel = slopedPlane();
    const copyOf = JSON.stringify(rel);
    calculateReadings(rel);
    expect(JSON.stringify(rel)).toBe(copyOf);
  });
});
