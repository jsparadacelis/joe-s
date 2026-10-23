import type { Punto, Relieve } from "@/lib/relieve";

/** Lecturas de la parcela visible. La pendiente se expresa en %. */
export interface Lecturas {
  superficie: number;
  alturaMin: number;
  alturaMax: number;
  desnivel: number;
  pendienteMedia: number;
}

/** Divisiones por eje del muestreo (61 × 61 puntos) y paso de las diferencias centrales, en m. */
const DIVISIONES = 60;
const PASO_GRADIENTE = 2;

const acotar = (valor: number, min: number, max: number) => Math.min(Math.max(valor, min), max);

/**
 * Altura del terreno en (x, y) por interpolación bilineal. Fila 0 = norte.
 * Fuera de la ventana se sujeta al borde.
 */
export function alturaEn(
  relieve: Pick<Relieve, "ventana" | "columnas" | "filas" | "alturas">,
  x: number,
  y: number,
): number {
  const { ventana, columnas, filas, alturas } = relieve;
  const [x0, y0, x1, y1] = ventana;
  const u = acotar(((x - x0) / (x1 - x0)) * (columnas - 1), 0, columnas - 1);
  const v = acotar(((y1 - y) / (y1 - y0)) * (filas - 1), 0, filas - 1);
  const i = Math.min(Math.floor(u), columnas - 2);
  const j = Math.min(Math.floor(v), filas - 2);
  const fu = u - i;
  const fv = v - j;
  const a = alturas[j * columnas + i];
  const b = alturas[j * columnas + i + 1];
  const c = alturas[(j + 1) * columnas + i];
  const d = alturas[(j + 1) * columnas + i + 1];
  return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv;
}

/** Área del polígono (fórmula del área de Gauss); siempre >= 0. */
export function areaPoligono(poligono: readonly Punto[]): number {
  let suma = 0;
  for (let i = 0; i < poligono.length; i++) {
    const [x, y] = poligono[i];
    const [x2, y2] = poligono[(i + 1) % poligono.length];
    suma += x * y2 - x2 * y;
  }
  return Math.abs(suma) / 2;
}

/** Punto dentro del polígono (regla par-impar). */
export function puntoEnPoligono(poligono: readonly Punto[], x: number, y: number): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, yi] = poligono[i];
    const [xj, yj] = poligono[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Lecturas dentro del perímetro recortado; `null` si no hay muestras dentro. */
export function calcularLecturas(relieve: Relieve): Lecturas | null {
  const [x0, y0, x1, y1] = relieve.ventana;
  let alturaMin = Infinity;
  let alturaMax = -Infinity;
  let sumaGradientes = 0;
  let muestras = 0;

  for (let j = 0; j <= DIVISIONES; j++) {
    for (let i = 0; i <= DIVISIONES; i++) {
      const x = x0 + (i * (x1 - x0)) / DIVISIONES;
      const y = y0 + (j * (y1 - y0)) / DIVISIONES;
      if (!puntoEnPoligono(relieve.perimetro, x, y)) continue;
      const h = alturaEn(relieve, x, y);
      alturaMin = Math.min(alturaMin, h);
      alturaMax = Math.max(alturaMax, h);
      const gx = (alturaEn(relieve, x + PASO_GRADIENTE, y) - alturaEn(relieve, x - PASO_GRADIENTE, y)) / (2 * PASO_GRADIENTE);
      const gy = (alturaEn(relieve, x, y + PASO_GRADIENTE) - alturaEn(relieve, x, y - PASO_GRADIENTE)) / (2 * PASO_GRADIENTE);
      sumaGradientes += Math.hypot(gx, gy);
      muestras++;
    }
  }
  if (muestras === 0) return null;
  return {
    superficie: relieve.superficiePoligono,
    alturaMin,
    alturaMax,
    desnivel: alturaMax - alturaMin,
    pendienteMedia: (sumaGradientes / muestras) * 100,
  };
}
