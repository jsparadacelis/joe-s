import { esReferenciaCatastralValida } from "@/lib/datos-tecnicos";
import { areaPoligono } from "@/lib/relieve-lecturas";

export type Margen = 0 | 10 | 25 | 50 | 100;
export type LadoMaximo = 100 | 200 | 300 | 500;
export type Exageracion = 1 | 2 | 3;
/** Metros en coordenadas locales (x este, y norte). */
export type Punto = readonly [number, number];
/** [x0, y0, x1, y1] en metros. */
export type Ventana = readonly [number, number, number, number];

export interface OpcionesRelieve {
  referencia: string;
  margen: Margen;
  ladoMaximo: LadoMaximo;
}

export interface Relieve {
  referencia: string;
  /** La rejilla cubre exactamente la ventana. */
  ventana: Ventana;
  columnas: number;
  filas: number;
  /** filas × columnas, fila 0 = norte (y máxima), orden de lectura. */
  alturas: readonly number[];
  /** Perímetro de la parcela recortado a la ventana. */
  perimetro: readonly Punto[];
  /** m² del perímetro completo (sin recortar). */
  superficiePoligono: number;
  /** La ventana se limitó al lado máximo. */
  recortada: boolean;
  /** El perímetro quedó cortado por la ventana. */
  parcelaCortada: boolean;
  fuente: string;
}

export const MARGENES: readonly Margen[] = [0, 10, 25, 50, 100];
export const LADOS_MAXIMOS: readonly LadoMaximo[] = [100, 200, 300, 500];
export const EXAGERACIONES: readonly Exageracion[] = [1, 2, 3];

// ---------------------------------------------------------------------------
// Capa de ejemplo, SUSTITUIBLE por el cliente de la API de relieve (RGB-33).
// Todo lo que sigue hasta `obtenerRelieve` es ficticio y determinista: el
// servicio real decidirá la ventana, pedirá el MDT del IGN solo de esa ventana
// y devolverá la rejilla, el perímetro INSPIRE recortado y los indicadores.
// El front nunca llama a servicios externos.
// ---------------------------------------------------------------------------

/** Polígono recortado a un rectángulo (Sutherland–Hodgman). No modifica la entrada. */
export function recortarPoligono(poligono: readonly Punto[], ventana: Ventana): Punto[] {
  const [x0, y0, x1, y1] = ventana;
  const dentro = [
    (p: Punto) => p[0] >= x0,
    (p: Punto) => p[0] <= x1,
    (p: Punto) => p[1] >= y0,
    (p: Punto) => p[1] <= y1,
  ];
  const cortar = (a: Punto, b: Punto, lado: number): Punto => {
    switch (lado) {
      case 0: return [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])];
      case 1: return [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])];
      case 2: return [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0];
      default: return [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1];
    }
  };

  let salida: Punto[] = poligono.map(([x, y]) => [x, y]);
  dentro.forEach((estaDentro, lado) => {
    const entrada = salida;
    salida = [];
    for (let i = 0; i < entrada.length; i++) {
      const a = entrada[i];
      const b = entrada[(i + 1) % entrada.length];
      const ia = estaDentro(a);
      const ib = estaDentro(b);
      if (ia && ib) salida.push(b);
      else if (ia && !ib) salida.push(cortar(a, b, lado));
      else if (!ia && ib) salida.push(cortar(a, b, lado), b);
    }
  });
  return salida;
}

/**
 * Caja de la parcela + margen. Si una dimensión supera el lado máximo, se centra
 * en el centroide (media de vértices) con ese lado; `recortada` indica si alguna se limitó.
 */
export function calcularVentana(
  perimetro: readonly Punto[],
  margen: number,
  ladoMaximo: number,
): { ventana: [number, number, number, number]; recortada: boolean } {
  const xs = perimetro.map((p) => p[0]);
  const ys = perimetro.map((p) => p[1]);
  const centro = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const eje = (valores: number[]): [number, number, boolean] => {
    const min = Math.min(...valores) - margen;
    const max = Math.max(...valores) + margen;
    if (max - min <= ladoMaximo) return [min, max, false];
    const c = centro(valores);
    return [c - ladoMaximo / 2, c + ladoMaximo / 2, true];
  };
  const [x0, x1, limitadaX] = eje(xs);
  const [y0, y1, limitadaY] = eje(ys);
  return { ventana: [x0, y0, x1, y1], recortada: limitadaX || limitadaY };
}

/** Generador pseudoaleatorio determinista a partir de un texto (hash FNV-1a + mezcla). */
function aleatorio(semilla: string): () => number {
  let h = 2166136261 >>> 0;
  for (const c of semilla) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Paso de la rejilla simulada, en m (como el MDT de 5 m del IGN). */
const PASO_REJILLA = 5;

interface Terreno {
  perimetro: Punto[];
  altura: (x: number, y: number) => number;
}

/** Parcela y terreno simulados: rústica (~8-10 ha) si la referencia es de 5 dígitos + «A»; si no, residencial. */
function simularTerreno(referencia: string): Terreno {
  const rnd = aleatorio(referencia);
  const rustica = /^\d{5}A/.test(referencia);
  const vertices = 5 + Math.floor(rnd() * 4);
  const giro = rnd() * Math.PI;
  const bruto: Punto[] = Array.from({ length: vertices }, (_, i) => {
    const angulo = giro + (i / vertices) * Math.PI * 2;
    const radio = 0.75 + rnd() * 0.45;
    return [Math.cos(angulo) * radio, Math.sin(angulo) * radio];
  });
  const objetivo = rustica ? 80000 + rnd() * 20000 : 400 + rnd() * 800;
  const escala = Math.sqrt(objetivo / areaPoligono(bruto));
  const perimetro = bruto.map(([x, y]): Punto => [x * escala, y * escala]);

  const pendienteX = (rnd() - 0.5) * 0.24;
  const pendienteY = (rnd() - 0.5) * 0.24;
  const amplitud = 2 + rnd() * (rustica ? 14 : 5);
  const onda1 = 30 + rnd() * 60;
  const onda2 = 30 + rnd() * 60;
  const fase = rnd() * 6;
  const base = 80 + rnd() * 400;
  return {
    perimetro,
    altura: (x, y) =>
      base +
      x * pendienteX +
      y * pendienteY +
      amplitud * Math.sin(x / onda1 + fase) * Math.cos(y / onda2) +
      0.6 * Math.sin(x / 7) * Math.sin(y / 9),
  };
}

/**
 * Relieve de una referencia catastral. Rechaza con Error si la referencia no es válida.
 * Sustituible por el cliente de la API (RGB-33) manteniendo esta firma.
 */
export async function obtenerRelieve({ referencia, margen, ladoMaximo }: OpcionesRelieve): Promise<Relieve> {
  if (!esReferenciaCatastralValida(referencia)) {
    throw new Error("La referencia catastral debe tener 20 caracteres.");
  }
  const ref = referencia.trim().toUpperCase();
  const { perimetro, altura } = simularTerreno(ref);
  const { ventana, recortada } = calcularVentana(perimetro, margen, ladoMaximo);
  const [x0, y0, x1, y1] = ventana;
  const columnas = Math.max(2, Math.round((x1 - x0) / PASO_REJILLA) + 1);
  const filas = Math.max(2, Math.round((y1 - y0) / PASO_REJILLA) + 1);

  const alturas: number[] = [];
  for (let j = 0; j < filas; j++) {
    for (let i = 0; i < columnas; i++) {
      alturas.push(altura(x0 + (i * (x1 - x0)) / (columnas - 1), y1 - (j * (y1 - y0)) / (filas - 1)));
    }
  }

  const superficiePoligono = areaPoligono(perimetro);
  const recorte = recortarPoligono(perimetro, ventana);
  return {
    referencia: ref,
    ventana: [x0, y0, x1, y1],
    columnas,
    filas,
    alturas,
    perimetro: recorte,
    superficiePoligono,
    recortada,
    parcelaCortada: areaPoligono(recorte) < superficiePoligono - 0.5,
    fuente: "Relieve simulado",
  };
}
