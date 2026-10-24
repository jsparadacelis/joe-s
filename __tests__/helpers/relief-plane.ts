import type { Point, Relief } from "@/lib/relief";

/** Ventana de prueba de 100 × 100 m con rejilla de 101 × 101 (paso de 1 m). */
export const TEST_WINDOW = [0, 0, 100, 100] as const;

/**
 * Construye un relieve sintético a partir de una función de altura h(x, y).
 * Fila 0 = norte (y máxima), orden de lectura, como exige el contrato.
 */
export function reliefFromFunction(
  h: (x: number, y: number) => number,
  extra: Partial<Relief> = {},
): Relief {
  const [x0, y0, x1, y1] = extra.viewWindow ?? TEST_WINDOW;
  const columns = extra.columns ?? 101;
  const rows = extra.rows ?? 101;
  const heights: number[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const x = x0 + (i * (x1 - x0)) / (columns - 1);
      const y = y1 - (j * (y1 - y0)) / (rows - 1);
      heights.push(h(x, y));
    }
  }
  const perimeter: Point[] = [
    [20, 20],
    [80, 20],
    [80, 80],
    [20, 80],
  ];
  return {
    reference: "1234567DG3413S0001AB",
    viewWindow: [x0, y0, x1, y1],
    columns,
    rows,
    heights,
    perimeter,
    polygonSurface: 123456,
    clamped: false,
    plotClipped: false,
    source: "Fuente de prueba (ficticia)",
    ...extra,
  };
}

/** Plano inclinado h = 100 + 0,1·x: pendiente del 10 % hacia el este. */
export const slopedPlane = (extra: Partial<Relief> = {}) => reliefFromFunction((x) => 100 + 0.1 * x, extra);
