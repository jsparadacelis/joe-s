import type { Punto, Relieve } from "@/lib/relieve";

/** Ventana de prueba de 100 × 100 m con rejilla de 101 × 101 (paso de 1 m). */
export const VENTANA_PRUEBA = [0, 0, 100, 100] as const;

/**
 * Construye un relieve sintético a partir de una función de altura h(x, y).
 * Fila 0 = norte (y máxima), orden de lectura, como exige el contrato.
 */
export function relieveDesdeFuncion(
  h: (x: number, y: number) => number,
  extra: Partial<Relieve> = {},
): Relieve {
  const [x0, y0, x1, y1] = extra.ventana ?? VENTANA_PRUEBA;
  const columnas = extra.columnas ?? 101;
  const filas = extra.filas ?? 101;
  const alturas: number[] = [];
  for (let j = 0; j < filas; j++) {
    for (let i = 0; i < columnas; i++) {
      const x = x0 + (i * (x1 - x0)) / (columnas - 1);
      const y = y1 - (j * (y1 - y0)) / (filas - 1);
      alturas.push(h(x, y));
    }
  }
  const perimetro: Punto[] = [
    [20, 20],
    [80, 20],
    [80, 80],
    [20, 80],
  ];
  return {
    referencia: "1234567DG3413S0001AB",
    ventana: [x0, y0, x1, y1],
    columnas,
    filas,
    alturas,
    perimetro,
    superficiePoligono: 123456,
    recortada: false,
    parcelaCortada: false,
    fuente: "Fuente de prueba (ficticia)",
    ...extra,
  };
}

/** Plano inclinado h = 100 + 0,1·x: pendiente del 10 % hacia el este. */
export const planoInclinado = (extra: Partial<Relieve> = {}) => relieveDesdeFuncion((x) => 100 + 0.1 * x, extra);
