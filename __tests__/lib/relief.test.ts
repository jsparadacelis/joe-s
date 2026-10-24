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

describe("constantes", () => {
  it("MARGENES, LADOS_MAXIMOS y EXAGERACIONES", () => {
    expect([...MARGINS]).toEqual([0, 10, 25, 50, 100]);
    expect([...MAX_SIDES]).toEqual([100, 200, 300, 500]);
    expect([...EXAGGERATIONS]).toEqual([1, 2, 3]);
  });
});

describe("recortarPoligono", () => {
  const viewWindow = [0, 0, 10, 10] as const;
  const key = (p: readonly (readonly [number, number])[]) =>
    p.map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`).sort();

  it("polígono dentro de la ventana: queda igual", () => {
    const polygon = [[2, 2], [8, 2], [8, 8], [2, 8]] as const;
    const r = clipPolygon(polygon, viewWindow);
    expect(key(r)).toEqual(key(polygon));
    expect(polygonArea(r)).toBeCloseTo(36, 9);
  });

  it("polígono fuera de la ventana: vacío", () => {
    expect(clipPolygon([[20, 20], [30, 20], [30, 30], [20, 30]], viewWindow)).toEqual([]);
  });

  it("polígono cortado por un lado: aparecen vértices nuevos sobre el borde", () => {
    const polygon = [[5, 2], [15, 2], [15, 8], [5, 8]] as const;
    const r = clipPolygon(polygon, viewWindow);
    expect(r.length).toBeGreaterThanOrEqual(4);
    expect(polygonArea(r)).toBeCloseTo(30, 6); // 5 × 6
    expect(polygonArea(r)).toBeLessThan(polygonArea(polygon));
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
    const r = clipPolygon([[5, 5], [15, 5], [15, 15], [5, 15]], viewWindow);
    expect(polygonArea(r)).toBeCloseTo(25, 6);
  });

  it("ventana que contiene todo el polígono: no cambia el área", () => {
    const polygon = [[0, 0], [40, 0], [40, 30], [0, 30]] as const;
    const r = clipPolygon(polygon, [-100, -100, 100, 100]);
    expect(polygonArea(r)).toBeCloseTo(1200, 9);
  });

  it("ventana contenida en el polígono: devuelve la propia ventana", () => {
    const r = clipPolygon([[-50, -50], [50, -50], [50, 50], [-50, 50]], viewWindow);
    expect(polygonArea(r)).toBeCloseTo(100, 6);
  });

  it("no modifica la entrada", () => {
    const polygon = [[5, 2], [15, 2], [15, 8], [5, 8]] as [number, number][];
    const copyOf = JSON.stringify(polygon);
    clipPolygon(polygon, viewWindow);
    expect(JSON.stringify(polygon)).toBe(copyOf);
  });
});

describe("calcularVentana", () => {
  const parcela = [[0, 0], [40, 0], [40, 30], [0, 30]] as const;

  it("caja de la parcela + margen", () => {
    const { viewWindow, clamped } = calculateViewWindow(parcela, 10, 200);
    expect(viewWindow).toEqual([-10, -10, 50, 40]);
    expect(clamped).toBe(false);
  });

  it.each([0, 10, 25, 50, 100])("margen %i m ensancha la caja por los cuatro lados", (m) => {
    const { viewWindow } = calculateViewWindow(parcela, m, 500);
    expect(viewWindow).toEqual([0 - m, 0 - m, 40 + m, 30 + m]);
  });

  it("margen 0: exactamente la caja de la parcela", () => {
    const { viewWindow, clamped } = calculateViewWindow(parcela, 0, 100);
    expect(viewWindow).toEqual([0, 0, 40, 30]);
    expect(clamped).toBe(false);
  });

  it("si el ancho supera el lado máximo, se centra en el centroide (media de vértices)", () => {
    // Vértices con x medios = 250 (no coincide con el centroide de área, 300): el plan fija la media de vértices.
    const larga = [[0, 0], [100, 0], [200, 0], [600, 0], [600, 10], [0, 10]] as const;
    const { viewWindow, clamped } = calculateViewWindow(larga, 0, 200);
    expect(viewWindow[0]).toBeCloseTo(150, 9);
    expect(viewWindow[2]).toBeCloseTo(350, 9);
    expect(clamped).toBe(true);
  });

  it("parcela grande centrada en el centroide: ventana cuadrada del lado máximo", () => {
    const grande = [[-300, -200], [300, -200], [300, 200], [-300, 200]] as const;
    const { viewWindow, clamped } = calculateViewWindow(grande, 25, 200);
    expect(viewWindow).toEqual([-100, -100, 100, 100]);
    expect(clamped).toBe(true);
  });

  it("dimensión por dimensión: solo se limita la que supera el lado", () => {
    const ancha = [[0, 0], [400, 0], [400, 100], [0, 100]] as const;
    const { viewWindow, clamped } = calculateViewWindow(ancha, 25, 200);
    expect(viewWindow[0]).toBeCloseTo(100, 9);
    expect(viewWindow[2]).toBeCloseTo(300, 9);
    expect(viewWindow[1]).toBeCloseTo(-25, 9); // alto 150 < 200: caja + margen
    expect(viewWindow[3]).toBeCloseTo(125, 9);
    expect(clamped).toBe(true);
  });

  it("«recortada» solo si se limitó: un ancho igual al lado máximo no cuenta", () => {
    const justa = [[0, 0], [150, 0], [150, 150], [0, 150]] as const;
    const { viewWindow, clamped } = calculateViewWindow(justa, 25, 200); // 150 + 50 = 200
    expect(viewWindow).toEqual([-25, -25, 175, 175]);
    expect(clamped).toBe(false);
  });

  it("nunca devuelve más del lado máximo en ninguna dimensión", () => {
    for (const side of [100, 200, 300, 500]) {
      const { viewWindow } = calculateViewWindow([[0, 0], [1000, 0], [1000, 900], [0, 900]], 100, side);
      expect(viewWindow[2] - viewWindow[0]).toBeLessThanOrEqual(side + EPS);
      expect(viewWindow[3] - viewWindow[1]).toBeLessThanOrEqual(side + EPS);
    }
  });
});

describe("obtenerRelieve", () => {
  const options = (reference: string, margin: Margin = 25, maxSide: MaxSide = 200) => ({
    reference,
    margin,
    maxSide,
  });

  it.each([
    ["19 caracteres", "1234567DG3413S0001A"],
    ["21 caracteres", "1234567DG3413S0001ABC"],
    ["símbolos", "1234567DG3413S00$1AB"],
    ["vacía", ""],
    ["con espacios", "1234567DG3413 S001AB"],
  ])("referencia inválida (%s): rechaza con Error", async (_n, reference) => {
    await expect(fetchRelief(options(reference))).rejects.toBeInstanceOf(Error);
  });

  it("referencia residencial: rejilla coherente y datos completos", async () => {
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

  it("parcela pequeña con margen y lado holgados: no está recortada ni cortada", async () => {
    const r = await fetchRelief(options(RESIDENTIAL, 25, 200));
    expect(r.clamped).toBe(false);
    expect(r.plotClipped).toBe(false);
    expect(polygonArea(r.perimeter)).toBeCloseTo(r.polygonSurface, 0);
  });

  it("es determinista: misma referencia y opciones, mismo resultado", async () => {
    const a = await fetchRelief(options(RESIDENTIAL));
    const b = await fetchRelief(options(RESIDENTIAL));
    expect(b).toEqual(a);
  });

  it("cambia con otra referencia", async () => {
    const a = await fetchRelief(options(RESIDENTIAL));
    const b = await fetchRelief(options("7654321DG3413S0001ZZ"));
    expect(b.heights).not.toEqual(a.heights);
  });

  it("criterio RGB-33: parcela rústica de ~9 ha con lado 200 m y margen 25 m -> ventana de 200 × 200 m, recortada", async () => {
    const r = await fetchRelief(options(RURAL, 25, 200));
    const [x0, y0, x1, y1] = r.viewWindow;
    expect(x1 - x0).toBeCloseTo(200, 6);
    expect(y1 - y0).toBeCloseTo(200, 6);
    expect(r.clamped).toBe(true);
    expect(r.polygonSurface).toBeGreaterThanOrEqual(70000);
    expect(r.heights).toHaveLength(r.columns * r.rows);
  });

  it("la rústica con lado 100 m: sigue recortada, cortada, y su ventana es de 100 × 100 m", async () => {
    const r = await fetchRelief(options(RURAL, 25, 100));
    expect(r.viewWindow[2] - r.viewWindow[0]).toBeCloseTo(100, 6);
    expect(r.viewWindow[3] - r.viewWindow[1]).toBeCloseTo(100, 6);
    expect(r.clamped).toBe(true);
    expect(r.plotClipped).toBe(true); // la ventana (1 ha) es mucho menor que la parcela (>= 7 ha)
    expect(polygonArea(r.perimeter)).toBeLessThan(r.polygonSurface);
  });

  it("la rústica con lado 500 m: la ventana nunca supera el lado máximo", async () => {
    const r = await fetchRelief(options(RURAL, 25, 500));
    expect(r.viewWindow[2] - r.viewWindow[0]).toBeLessThanOrEqual(500 + EPS);
    expect(r.viewWindow[3] - r.viewWindow[1]).toBeLessThanOrEqual(500 + EPS);
  });

  it.each([
    [RESIDENTIAL, "residential"],
    [RURAL, "rústica"],
  ])("coherencia de recortada y parcelaCortada en todas las combinaciones (%s, %s)", async (reference) => {
    for (const margin of MARGINS) {
      for (const maxSide of MAX_SIDES) {
        const r: Relief = await fetchRelief({ reference, margin, maxSide });
        const area = polygonArea(r.perimeter);
        const label = `${reference} margen ${margin} lado ${maxSide}`;
        expect(r.viewWindow[2] - r.viewWindow[0]).toBeLessThanOrEqual(maxSide + EPS);
        expect(r.viewWindow[3] - r.viewWindow[1]).toBeLessThanOrEqual(maxSide + EPS);
        expect(area).toBeLessThanOrEqual(r.polygonSurface + 1);
        if (r.plotClipped) expect({ label, recorta: area < r.polygonSurface }).toEqual({ label, recorta: true });
        else expect({ label, dif: Math.abs(area - r.polygonSurface) < 1 }).toEqual({ label, dif: true });
        if (r.clamped) {
          // Si la ventana se limitó, alguna dimensión mide exactamente el lado máximo.
          const w = r.viewWindow[2] - r.viewWindow[0];
          const h = r.viewWindow[3] - r.viewWindow[1];
          expect(Math.max(w, h)).toBeCloseTo(maxSide, 6);
        }
      }
    }
  });

  it("margen 0 en una parcela pequeña: la ventana es la caja de la parcela y no la corta", async () => {
    const r = await fetchRelief(options(RESIDENTIAL, 0, 200));
    expect(r.plotClipped).toBe(false);
    expect(r.clamped).toBe(false);
  });

  it("un margen mayor da una ventana mayor (o igual) con el mismo lado", async () => {
    const chico = await fetchRelief(options(RESIDENTIAL, 10, 500));
    const grande = await fetchRelief(options(RESIDENTIAL, 100, 500));
    expect(grande.viewWindow[2] - grande.viewWindow[0]).toBeGreaterThan(chico.viewWindow[2] - chico.viewWindow[0]);
  });

  it("devuelve copias: mutar el resultado no afecta a la siguiente llamada", async () => {
    const a = await fetchRelief(options(RESIDENTIAL));
    const original = structuredClone(a);
    (a.heights as number[]).fill(-1);
    (a.perimeter as unknown as number[][]).push([0, 0]);
    (a.viewWindow as unknown as number[])[0] = 12345;
    const b = await fetchRelief(options(RESIDENTIAL));
    expect(b).toEqual(original);
  });
});
