import { isValidCadastralReference } from "@/lib/technical-data";
import { polygonArea } from "@/lib/relief-readings";

export type Margin = 0 | 10 | 25 | 50 | 100;
export type MaxSide = 100 | 200 | 300 | 500;
export type Exageracion = 1 | 2 | 3;
/** Metros en coordenadas locales (x este, y norte). */
export type Point = readonly [number, number];
/** [x0, y0, x1, y1] en metros. */
export type ViewWindow = readonly [number, number, number, number];

export interface ReliefOptions {
  reference: string;
  margin: Margin;
  maxSide: MaxSide;
}

export interface Relief {
  reference: string;
  /** La rejilla cubre exactamente la ventana. */
  viewWindow: ViewWindow;
  columns: number;
  rows: number;
  /** filas × columnas, fila 0 = norte (y máxima), orden de lectura. */
  heights: readonly number[];
  /** Perímetro de la parcela recortado a la ventana. */
  perimeter: readonly Point[];
  /** m² del perímetro completo (sin recortar). */
  polygonSurface: number;
  /** La ventana se limitó al lado máximo. */
  clamped: boolean;
  /** El perímetro quedó cortado por la ventana. */
  plotClipped: boolean;
  source: string;
}

export const MARGINS: readonly Margin[] = [0, 10, 25, 50, 100];
export const MAX_SIDES: readonly MaxSide[] = [100, 200, 300, 500];
export const EXAGGERATIONS: readonly Exageracion[] = [1, 2, 3];

// ---------------------------------------------------------------------------
// Capa de ejemplo, SUSTITUIBLE por el cliente de la API de relieve (RGB-33).
// Todo lo que sigue hasta `obtenerRelieve` es ficticio y determinista: el
// servicio real decidirá la ventana, pedirá el MDT del IGN solo de esa ventana
// y devolverá la rejilla, el perímetro INSPIRE recortado y los indicadores.
// El front nunca llama a servicios externos.
// ---------------------------------------------------------------------------

/** Polígono recortado a un rectángulo (Sutherland–Hodgman). No modifica la entrada. */
export function clipPolygon(polygon: readonly Point[], viewWindow: ViewWindow): Point[] {
  const [x0, y0, x1, y1] = viewWindow;
  const dentro = [
    (p: Point) => p[0] >= x0,
    (p: Point) => p[0] <= x1,
    (p: Point) => p[1] >= y0,
    (p: Point) => p[1] <= y1,
  ];
  const cortar = (a: Point, b: Point, side: number): Point => {
    switch (side) {
      case 0: return [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])];
      case 1: return [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])];
      case 2: return [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0];
      default: return [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1];
    }
  };

  let output: Point[] = polygon.map(([x, y]) => [x, y]);
  dentro.forEach((estaDentro, side) => {
    const entrada = output;
    output = [];
    for (let i = 0; i < entrada.length; i++) {
      const a = entrada[i];
      const b = entrada[(i + 1) % entrada.length];
      const ia = estaDentro(a);
      const ib = estaDentro(b);
      if (ia && ib) output.push(b);
      else if (ia && !ib) output.push(cortar(a, b, side));
      else if (!ia && ib) output.push(cortar(a, b, side), b);
    }
  });
  return output;
}

/**
 * Caja de la parcela + margen. Si una dimensión supera el lado máximo, se centra
 * en el centroide (media de vértices) con ese lado; `recortada` indica si alguna se limitó.
 */
export function calculateViewWindow(
  perimeter: readonly Point[],
  margin: number,
  maxSide: number,
): { viewWindow: [number, number, number, number]; clamped: boolean } {
  const xs = perimeter.map((p) => p[0]);
  const ys = perimeter.map((p) => p[1]);
  const center = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const eje = (values: number[]): [number, number, boolean] => {
    const min = Math.min(...values) - margin;
    const max = Math.max(...values) + margin;
    if (max - min <= maxSide) return [min, max, false];
    const c = center(values);
    return [c - maxSide / 2, c + maxSide / 2, true];
  };
  const [x0, x1, limitedX] = eje(xs);
  const [y0, y1, limitedY] = eje(ys);
  return { viewWindow: [x0, y0, x1, y1], clamped: limitedX || limitedY };
}

/** Generador pseudoaleatorio determinista a partir de un texto (hash FNV-1a + mezcla). */
function aleatorio(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Paso de la rejilla simulada, en m (como el MDT de 5 m del IGN). */
const GRID_STEP = 5;

interface Terrain {
  perimeter: Point[];
  height: (x: number, y: number) => number;
}

/** Parcela y terreno simulados: rústica (~8-10 ha) si la referencia es de 5 dígitos + «A»; si no, residencial. */
function simulateTerrain(reference: string): Terrain {
  const rnd = aleatorio(reference);
  const rural = /^\d{5}A/.test(reference);
  const vertices = 5 + Math.floor(rnd() * 4);
  const giro = rnd() * Math.PI;
  const raw: Point[] = Array.from({ length: vertices }, (_, i) => {
    const angle = giro + (i / vertices) * Math.PI * 2;
    const radius = 0.75 + rnd() * 0.45;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });
  const target = rural ? 80000 + rnd() * 20000 : 400 + rnd() * 800;
  const escala = Math.sqrt(target / polygonArea(raw));
  const perimeter = raw.map(([x, y]): Point => [x * escala, y * escala]);

  const slopeX = (rnd() - 0.5) * 0.24;
  const slopeY = (rnd() - 0.5) * 0.24;
  const amplitude = 2 + rnd() * (rural ? 14 : 5);
  const onda1 = 30 + rnd() * 60;
  const onda2 = 30 + rnd() * 60;
  const phase = rnd() * 6;
  const base = 80 + rnd() * 400;
  return {
    perimeter,
    height: (x, y) =>
      base +
      x * slopeX +
      y * slopeY +
      amplitude * Math.sin(x / onda1 + phase) * Math.cos(y / onda2) +
      0.6 * Math.sin(x / 7) * Math.sin(y / 9),
  };
}

/**
 * Relieve de una referencia catastral. Rechaza con Error si la referencia no es válida.
 * Sustituible por el cliente de la API (RGB-33) manteniendo esta firma.
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
