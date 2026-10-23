import {
  EXAGERACIONES,
  LADOS_MAXIMOS,
  MARGENES,
  calcularVentana,
  obtenerRelieve,
  recortarPoligono,
  type Margen,
  type LadoMaximo,
  type Relieve,
} from "@/lib/relieve";
import { areaPoligono } from "@/lib/relieve-lecturas";

const RESIDENCIAL = "1234567DG3413S0001AB";
const RUSTICA = "08187A005001230000OK";
const EPS = 1e-6;

describe("constantes", () => {
  it("MARGENES, LADOS_MAXIMOS y EXAGERACIONES", () => {
    expect([...MARGENES]).toEqual([0, 10, 25, 50, 100]);
    expect([...LADOS_MAXIMOS]).toEqual([100, 200, 300, 500]);
    expect([...EXAGERACIONES]).toEqual([1, 2, 3]);
  });
});

describe("recortarPoligono", () => {
  const ventana = [0, 0, 10, 10] as const;
  const clave = (p: readonly (readonly [number, number])[]) =>
    p.map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`).sort();

  it("polígono dentro de la ventana: queda igual", () => {
    const poligono = [[2, 2], [8, 2], [8, 8], [2, 8]] as const;
    const r = recortarPoligono(poligono, ventana);
    expect(clave(r)).toEqual(clave(poligono));
    expect(areaPoligono(r)).toBeCloseTo(36, 9);
  });

  it("polígono fuera de la ventana: vacío", () => {
    expect(recortarPoligono([[20, 20], [30, 20], [30, 30], [20, 30]], ventana)).toEqual([]);
  });

  it("polígono cortado por un lado: aparecen vértices nuevos sobre el borde", () => {
    const poligono = [[5, 2], [15, 2], [15, 8], [5, 8]] as const;
    const r = recortarPoligono(poligono, ventana);
    expect(r.length).toBeGreaterThanOrEqual(4);
    expect(areaPoligono(r)).toBeCloseTo(30, 6); // 5 × 6
    expect(areaPoligono(r)).toBeLessThan(areaPoligono(poligono));
    const sobreElBorde = r.filter(([x]) => Math.abs(x - 10) < EPS);
    expect(sobreElBorde.length).toBeGreaterThanOrEqual(2);
    for (const [x, y] of r) {
      expect(x).toBeGreaterThanOrEqual(-EPS);
      expect(x).toBeLessThanOrEqual(10 + EPS);
      expect(y).toBeGreaterThanOrEqual(-EPS);
      expect(y).toBeLessThanOrEqual(10 + EPS);
    }
  });

  it("polígono cortado por una esquina: el área es la de la intersección", () => {
    const r = recortarPoligono([[5, 5], [15, 5], [15, 15], [5, 15]], ventana);
    expect(areaPoligono(r)).toBeCloseTo(25, 6);
  });

  it("ventana que contiene todo el polígono: no cambia el área", () => {
    const poligono = [[0, 0], [40, 0], [40, 30], [0, 30]] as const;
    const r = recortarPoligono(poligono, [-100, -100, 100, 100]);
    expect(areaPoligono(r)).toBeCloseTo(1200, 9);
  });

  it("ventana contenida en el polígono: devuelve la propia ventana", () => {
    const r = recortarPoligono([[-50, -50], [50, -50], [50, 50], [-50, 50]], ventana);
    expect(areaPoligono(r)).toBeCloseTo(100, 6);
  });

  it("no modifica la entrada", () => {
    const poligono = [[5, 2], [15, 2], [15, 8], [5, 8]] as [number, number][];
    const copia = JSON.stringify(poligono);
    recortarPoligono(poligono, ventana);
    expect(JSON.stringify(poligono)).toBe(copia);
  });
});

describe("calcularVentana", () => {
  const parcela = [[0, 0], [40, 0], [40, 30], [0, 30]] as const;

  it("caja de la parcela + margen", () => {
    const { ventana, recortada } = calcularVentana(parcela, 10, 200);
    expect(ventana).toEqual([-10, -10, 50, 40]);
    expect(recortada).toBe(false);
  });

  it.each([0, 10, 25, 50, 100])("margen %i m ensancha la caja por los cuatro lados", (m) => {
    const { ventana } = calcularVentana(parcela, m, 500);
    expect(ventana).toEqual([-m, -m, 40 + m, 30 + m]);
  });

  it("margen 0: exactamente la caja de la parcela", () => {
    const { ventana, recortada } = calcularVentana(parcela, 0, 100);
    expect(ventana).toEqual([0, 0, 40, 30]);
    expect(recortada).toBe(false);
  });

  it("si el ancho supera el lado máximo, se centra en el centroide (media de vértices)", () => {
    // Vértices con x medios = 250 (no coincide con el centroide de área, 300): el plan fija la media de vértices.
    const larga = [[0, 0], [100, 0], [200, 0], [600, 0], [600, 10], [0, 10]] as const;
    const { ventana, recortada } = calcularVentana(larga, 0, 200);
    expect(ventana[0]).toBeCloseTo(150, 9);
    expect(ventana[2]).toBeCloseTo(350, 9);
    expect(recortada).toBe(true);
  });

  it("parcela grande centrada en el centroide: ventana cuadrada del lado máximo", () => {
    const grande = [[-300, -200], [300, -200], [300, 200], [-300, 200]] as const;
    const { ventana, recortada } = calcularVentana(grande, 25, 200);
    expect(ventana).toEqual([-100, -100, 100, 100]);
    expect(recortada).toBe(true);
  });

  it("dimensión por dimensión: solo se limita la que supera el lado", () => {
    const ancha = [[0, 0], [400, 0], [400, 100], [0, 100]] as const;
    const { ventana, recortada } = calcularVentana(ancha, 25, 200);
    expect(ventana[0]).toBeCloseTo(100, 9);
    expect(ventana[2]).toBeCloseTo(300, 9);
    expect(ventana[1]).toBeCloseTo(-25, 9); // alto 150 < 200: caja + margen
    expect(ventana[3]).toBeCloseTo(125, 9);
    expect(recortada).toBe(true);
  });

  it("«recortada» solo si se limitó: un ancho igual al lado máximo no cuenta", () => {
    const justa = [[0, 0], [150, 0], [150, 150], [0, 150]] as const;
    const { ventana, recortada } = calcularVentana(justa, 25, 200); // 150 + 50 = 200
    expect(ventana).toEqual([-25, -25, 175, 175]);
    expect(recortada).toBe(false);
  });

  it("nunca devuelve más del lado máximo en ninguna dimensión", () => {
    for (const lado of [100, 200, 300, 500]) {
      const { ventana } = calcularVentana([[0, 0], [1000, 0], [1000, 900], [0, 900]], 100, lado);
      expect(ventana[2] - ventana[0]).toBeLessThanOrEqual(lado + EPS);
      expect(ventana[3] - ventana[1]).toBeLessThanOrEqual(lado + EPS);
    }
  });
});

describe("obtenerRelieve", () => {
  const opciones = (referencia: string, margen: Margen = 25, ladoMaximo: LadoMaximo = 200) => ({
    referencia,
    margen,
    ladoMaximo,
  });

  it.each([
    ["19 caracteres", "1234567DG3413S0001A"],
    ["21 caracteres", "1234567DG3413S0001ABC"],
    ["símbolos", "1234567DG3413S00$1AB"],
    ["vacía", ""],
    ["con espacios", "1234567DG3413 S001AB"],
  ])("referencia inválida (%s): rechaza con Error", async (_n, referencia) => {
    await expect(obtenerRelieve(opciones(referencia))).rejects.toBeInstanceOf(Error);
  });

  it("referencia residencial: rejilla coherente y datos completos", async () => {
    const r = await obtenerRelieve(opciones(RESIDENCIAL));
    expect(r.referencia).toBe(RESIDENCIAL);
    expect(r.columnas).toBeGreaterThanOrEqual(2);
    expect(r.filas).toBeGreaterThanOrEqual(2);
    expect(r.alturas).toHaveLength(r.columnas * r.filas);
    expect(r.alturas.every((h) => Number.isFinite(h))).toBe(true);
    const [x0, y0, x1, y1] = r.ventana;
    expect(x1).toBeGreaterThan(x0);
    expect(y1).toBeGreaterThan(y0);
    expect(r.perimetro.length).toBeGreaterThanOrEqual(3);
    for (const [x, y] of r.perimetro) {
      expect(x).toBeGreaterThanOrEqual(x0 - EPS);
      expect(x).toBeLessThanOrEqual(x1 + EPS);
      expect(y).toBeGreaterThanOrEqual(y0 - EPS);
      expect(y).toBeLessThanOrEqual(y1 + EPS);
    }
    expect(r.superficiePoligono).toBeGreaterThan(0);
    expect(r.fuente.trim()).not.toBe("");
  });

  it("parcela pequeña con margen y lado holgados: no está recortada ni cortada", async () => {
    const r = await obtenerRelieve(opciones(RESIDENCIAL, 25, 200));
    expect(r.recortada).toBe(false);
    expect(r.parcelaCortada).toBe(false);
    expect(areaPoligono(r.perimetro)).toBeCloseTo(r.superficiePoligono, 0);
  });

  it("es determinista: misma referencia y opciones, mismo resultado", async () => {
    const a = await obtenerRelieve(opciones(RESIDENCIAL));
    const b = await obtenerRelieve(opciones(RESIDENCIAL));
    expect(b).toEqual(a);
  });

  it("cambia con otra referencia", async () => {
    const a = await obtenerRelieve(opciones(RESIDENCIAL));
    const b = await obtenerRelieve(opciones("7654321DG3413S0001ZZ"));
    expect(b.alturas).not.toEqual(a.alturas);
  });

  it("criterio RGB-33: parcela rústica de ~9 ha con lado 200 m y margen 25 m -> ventana de 200 × 200 m, recortada", async () => {
    const r = await obtenerRelieve(opciones(RUSTICA, 25, 200));
    const [x0, y0, x1, y1] = r.ventana;
    expect(x1 - x0).toBeCloseTo(200, 6);
    expect(y1 - y0).toBeCloseTo(200, 6);
    expect(r.recortada).toBe(true);
    expect(r.superficiePoligono).toBeGreaterThanOrEqual(70000);
    expect(r.alturas).toHaveLength(r.columnas * r.filas);
  });

  it("la rústica con lado 100 m: sigue recortada, cortada, y su ventana es de 100 × 100 m", async () => {
    const r = await obtenerRelieve(opciones(RUSTICA, 25, 100));
    expect(r.ventana[2] - r.ventana[0]).toBeCloseTo(100, 6);
    expect(r.ventana[3] - r.ventana[1]).toBeCloseTo(100, 6);
    expect(r.recortada).toBe(true);
    expect(r.parcelaCortada).toBe(true); // la ventana (1 ha) es mucho menor que la parcela (>= 7 ha)
    expect(areaPoligono(r.perimetro)).toBeLessThan(r.superficiePoligono);
  });

  it("la rústica con lado 500 m: la ventana nunca supera el lado máximo", async () => {
    const r = await obtenerRelieve(opciones(RUSTICA, 25, 500));
    expect(r.ventana[2] - r.ventana[0]).toBeLessThanOrEqual(500 + EPS);
    expect(r.ventana[3] - r.ventana[1]).toBeLessThanOrEqual(500 + EPS);
  });

  it.each([
    [RESIDENCIAL, "residencial"],
    [RUSTICA, "rústica"],
  ])("coherencia de recortada y parcelaCortada en todas las combinaciones (%s, %s)", async (referencia) => {
    for (const margen of MARGENES) {
      for (const ladoMaximo of LADOS_MAXIMOS) {
        const r: Relieve = await obtenerRelieve({ referencia, margen, ladoMaximo });
        const area = areaPoligono(r.perimetro);
        const etiqueta = `${referencia} margen ${margen} lado ${ladoMaximo}`;
        expect(r.ventana[2] - r.ventana[0]).toBeLessThanOrEqual(ladoMaximo + EPS);
        expect(r.ventana[3] - r.ventana[1]).toBeLessThanOrEqual(ladoMaximo + EPS);
        expect(area).toBeLessThanOrEqual(r.superficiePoligono + 1);
        if (r.parcelaCortada) expect({ etiqueta, recorta: area < r.superficiePoligono }).toEqual({ etiqueta, recorta: true });
        else expect({ etiqueta, dif: Math.abs(area - r.superficiePoligono) < 1 }).toEqual({ etiqueta, dif: true });
        if (r.recortada) {
          // Si la ventana se limitó, alguna dimensión mide exactamente el lado máximo.
          const w = r.ventana[2] - r.ventana[0];
          const h = r.ventana[3] - r.ventana[1];
          expect(Math.max(w, h)).toBeCloseTo(ladoMaximo, 6);
        }
      }
    }
  });

  it("margen 0 en una parcela pequeña: la ventana es la caja de la parcela y no la corta", async () => {
    const r = await obtenerRelieve(opciones(RESIDENCIAL, 0, 200));
    expect(r.parcelaCortada).toBe(false);
    expect(r.recortada).toBe(false);
  });

  it("un margen mayor da una ventana mayor (o igual) con el mismo lado", async () => {
    const chico = await obtenerRelieve(opciones(RESIDENCIAL, 10, 500));
    const grande = await obtenerRelieve(opciones(RESIDENCIAL, 100, 500));
    expect(grande.ventana[2] - grande.ventana[0]).toBeGreaterThan(chico.ventana[2] - chico.ventana[0]);
  });

  it("devuelve copias: mutar el resultado no afecta a la siguiente llamada", async () => {
    const a = await obtenerRelieve(opciones(RESIDENCIAL));
    const original = structuredClone(a);
    (a.alturas as number[]).fill(-1);
    (a.perimetro as unknown as number[][]).push([0, 0]);
    (a.ventana as unknown as number[])[0] = 12345;
    const b = await obtenerRelieve(opciones(RESIDENCIAL));
    expect(b).toEqual(original);
  });
});
