import { alturaEn, areaPoligono, calcularLecturas, puntoEnPoligono } from "@/lib/relieve-lecturas";
import { planoInclinado, relieveDesdeFuncion } from "../helpers/relieve-plano";

describe("areaPoligono", () => {
  const cuadrado = [[0, 0], [10, 0], [10, 10], [0, 10]] as const;

  it("cuadrado de 10 × 10 = 100", () => {
    expect(areaPoligono(cuadrado)).toBeCloseTo(100, 9);
  });

  it("no depende de la orientación (horaria o antihoraria): siempre >= 0", () => {
    expect(areaPoligono([...cuadrado].reverse())).toBeCloseTo(100, 9);
    expect(areaPoligono([...cuadrado].reverse())).toBeGreaterThanOrEqual(0);
  });

  it("triángulo rectángulo de catetos 6 y 4 = 12", () => {
    expect(areaPoligono([[0, 0], [6, 0], [0, 4]])).toBeCloseTo(12, 9);
  });

  it("no depende del vértice de partida ni de la posición", () => {
    expect(areaPoligono([[1000, 2000], [1010, 2000], [1010, 2010], [1000, 2010]])).toBeCloseTo(100, 6);
  });

  it("vacío, un punto o una recta = 0", () => {
    expect(areaPoligono([])).toBe(0);
    expect(areaPoligono([[1, 1]])).toBe(0);
    expect(areaPoligono([[0, 0], [5, 5]])).toBe(0);
  });
});

describe("puntoEnPoligono", () => {
  const cuadrado = [[0, 0], [10, 0], [10, 10], [0, 10]] as const;
  // «U» cóncava: el hueco central está abierto por arriba.
  const u = [[0, 0], [30, 0], [30, 30], [20, 30], [20, 10], [10, 10], [10, 30], [0, 30]] as const;

  it("dentro y fuera de un cuadrado", () => {
    expect(puntoEnPoligono(cuadrado, 5, 5)).toBe(true);
    expect(puntoEnPoligono(cuadrado, 11, 5)).toBe(false);
    expect(puntoEnPoligono(cuadrado, -1, 5)).toBe(false);
    expect(puntoEnPoligono(cuadrado, 5, 11)).toBe(false);
  });

  it("polígono cóncavo: el hueco queda fuera y los brazos dentro", () => {
    expect(puntoEnPoligono(u, 15, 20)).toBe(false);
    expect(puntoEnPoligono(u, 5, 20)).toBe(true);
    expect(puntoEnPoligono(u, 25, 20)).toBe(true);
    expect(puntoEnPoligono(u, 15, 5)).toBe(true);
  });

  it("polígono vacío: nunca contiene nada", () => {
    expect(puntoEnPoligono([], 0, 0)).toBe(false);
  });
});

describe("alturaEn (interpolación bilineal, fila 0 = norte)", () => {
  // Ventana [0,0,10,10], rejilla 2 × 2. Fila 0 = norte (y = 10).
  //   (0,10)=10  (10,10)=20
  //   (0,0) =30  (10,0) =40
  const rel = { ventana: [0, 0, 10, 10] as const, columnas: 2, filas: 2, alturas: [10, 20, 30, 40] };

  it("exacta en las cuatro esquinas", () => {
    expect(alturaEn(rel, 0, 10)).toBeCloseTo(10, 9);
    expect(alturaEn(rel, 10, 10)).toBeCloseTo(20, 9);
    expect(alturaEn(rel, 0, 0)).toBeCloseTo(30, 9);
    expect(alturaEn(rel, 10, 0)).toBeCloseTo(40, 9);
  });

  it("exacta en el centro y en los puntos medios de los lados", () => {
    expect(alturaEn(rel, 5, 5)).toBeCloseTo(25, 9);
    expect(alturaEn(rel, 5, 10)).toBeCloseTo(15, 9);
    expect(alturaEn(rel, 5, 0)).toBeCloseTo(35, 9);
    expect(alturaEn(rel, 0, 5)).toBeCloseTo(20, 9);
    expect(alturaEn(rel, 10, 5)).toBeCloseTo(30, 9);
  });

  it("interpola de forma bilineal en un punto cualquiera", () => {
    // u = 0.25 (este), v = 0.5 (de norte a sur): fila norte 10+2.5=12.5, fila sur 30+2.5=32.5 -> 22.5
    expect(alturaEn(rel, 2.5, 5)).toBeCloseTo(22.5, 9);
  });

  it("con una rejilla 3 × 3 usa la celda correcta", () => {
    const r3 = {
      ventana: [0, 0, 20, 20] as const,
      columnas: 3,
      filas: 3,
      // norte -> sur
      alturas: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    };
    expect(alturaEn(r3, 10, 10)).toBeCloseTo(5, 9);
    expect(alturaEn(r3, 20, 20)).toBeCloseTo(3, 9);
    expect(alturaEn(r3, 0, 0)).toBeCloseTo(7, 9);
    expect(alturaEn(r3, 15, 5)).toBeCloseTo(7, 9); // entre 5,6,8,9 en el centro de la celda SE
  });

  it("fuera de la ventana se sujeta al borde", () => {
    expect(alturaEn(rel, -50, 50)).toBeCloseTo(10, 9);
    expect(alturaEn(rel, 50, 50)).toBeCloseTo(20, 9);
    expect(alturaEn(rel, -5, -5)).toBeCloseTo(30, 9);
    expect(alturaEn(rel, 99, -99)).toBeCloseTo(40, 9);
    expect(alturaEn(rel, 5, 99)).toBeCloseTo(15, 9);
  });
});

describe("calcularLecturas", () => {
  it("plano inclinado h = 100 + 0,1·x: pendiente media ≈ 10 %", () => {
    const l = calcularLecturas(planoInclinado());
    expect(l).not.toBeNull();
    expect(l!.pendienteMedia).toBeGreaterThan(9.8);
    expect(l!.pendienteMedia).toBeLessThan(10.2);
  });

  it("altitud mínima y máxima coherentes con los extremos del perímetro (malla de 61 × 61)", () => {
    const l = calcularLecturas(planoInclinado())!;
    // Perímetro x ∈ [20, 80] -> h ∈ [102, 108]; la malla (paso 100/60 ≈ 1,67 m) queda dentro del perímetro.
    expect(l.alturaMin).toBeGreaterThanOrEqual(102 - 1e-9);
    expect(l.alturaMin).toBeLessThan(102.3);
    expect(l.alturaMax).toBeLessThanOrEqual(108 + 1e-9);
    expect(l.alturaMax).toBeGreaterThan(107.7);
  });

  it("desnivel = máxima − mínima", () => {
    const l = calcularLecturas(planoInclinado())!;
    expect(l.desnivel).toBeCloseTo(l.alturaMax - l.alturaMin, 9);
    expect(l.desnivel).toBeGreaterThan(5.4);
    expect(l.desnivel).toBeLessThan(6);
  });

  it("superficie = superficiePoligono (la del perímetro completo, no la recortada)", () => {
    const l = calcularLecturas(planoInclinado({ superficiePoligono: 98765.4 }))!;
    expect(l.superficie).toBe(98765.4);
  });

  it("plano horizontal: pendiente 0 y desnivel 0", () => {
    const l = calcularLecturas(relieveDesdeFuncion(() => 250))!;
    expect(l.pendienteMedia).toBeCloseTo(0, 9);
    expect(l.desnivel).toBeCloseTo(0, 9);
    expect(l.alturaMin).toBeCloseTo(250, 9);
    expect(l.alturaMax).toBeCloseTo(250, 9);
  });

  it("plano inclinado hacia el norte: la pendiente se mide en cualquier dirección", () => {
    const l = calcularLecturas(relieveDesdeFuncion((_x, y) => 50 + 0.05 * y))!;
    expect(l.pendienteMedia).toBeGreaterThan(4.8);
    expect(l.pendienteMedia).toBeLessThan(5.2);
  });

  it("perímetro fuera de la ventana -> null", () => {
    const fuera = planoInclinado({ perimetro: [[200, 200], [300, 200], [300, 300], [200, 300]] });
    expect(calcularLecturas(fuera)).toBeNull();
  });

  it("perímetro vacío -> null", () => {
    expect(calcularLecturas(planoInclinado({ perimetro: [] }))).toBeNull();
  });

  it("solo cuenta lo que cae dentro del perímetro", () => {
    const izquierda = calcularLecturas(planoInclinado({ perimetro: [[20, 20], [50, 20], [50, 80], [20, 80]] }))!;
    const derecha = calcularLecturas(planoInclinado({ perimetro: [[50, 20], [80, 20], [80, 80], [50, 80]] }))!;
    expect(izquierda.alturaMax).toBeLessThanOrEqual(105 + 1e-9);
    expect(derecha.alturaMin).toBeGreaterThanOrEqual(105 - 1e-9);
    expect(izquierda.alturaMax).toBeLessThan(derecha.alturaMax);
    expect(izquierda.alturaMin).toBeLessThan(derecha.alturaMin);
    // El desnivel de cada mitad es menor que el del perímetro entero.
    const entero = calcularLecturas(planoInclinado())!;
    expect(izquierda.desnivel).toBeLessThan(entero.desnivel);
    expect(derecha.desnivel).toBeLessThan(entero.desnivel);
  });

  it("no modifica el relieve de entrada", () => {
    const rel = planoInclinado();
    const copia = JSON.stringify(rel);
    calcularLecturas(rel);
    expect(JSON.stringify(rel)).toBe(copia);
  });
});
