# RGB-23 · Contrato asumido por los tests

Firmas y textos que el Desarrollador debe respetar para que los tests (`frontend/__tests__/`) pasen. Lo que no figura aquí queda a criterio del Desarrollador (estilos, estructura interna), siempre con tokens de color y en español en la interfaz. Se suma al contrato de RGB-11 (`docs/plans/RGB-11/contract.md`).

## `frontend/lib/portfolio.ts`

```ts
export interface PortfolioRow {
  // ...campos de RGB-11 sin cambios...
  /** Semanas activas y planificadas de la fase ACTUAL (las de `PhaseTiming` en lib/timing.ts).
   *  `null` si y solo si `status === "no-plan"` (oportunidad, sin plan). Las filas en pausa también
   *  la llevan (semanas congeladas). */
  phaseWeeks: { active: number; planned: number } | null;
}

/** null si la fila no tiene `phaseWeeks`. Si no: `{ percent: consumptionPercent(active, planned),
 *  trafficLight: consumptionTrafficLight(active, planned) }`. No depende de `status` (una fila en pausa
 *  devuelve su avance congelado; es el componente el que decide no colorearlo) y el porcentaje no se acota. */
export function phaseWeeksProgress(
  row: Pick<PortfolioRow, "phaseWeeks">,
): { percent: number; trafficLight: TrafficLight } | null;
```

- `fetchPortfolio()` devuelve copias independientes también de `phaseWeeks`. Las claves de cada fila son ahora: blocker, code, daysSinceUpdate, name, nextMilestone, owner, phase, phaseWeeks, status.
- Invariante: `phaseWeeks === null` <=> `no-plan` <=> `fetchTimingPlan(code) === null`; si no, igual a `activeWeeks`/`plannedWeeks` de la fase actual del plan (semanas enteras, `active >= 0`, `planned > 0`).
- Valores de ejemplo (salen de `lib/timing.ts`, no se inventan):

| Proyecto | Fase | phaseWeeks | % | Semáforo (consumo) |
|---|---|---|---|---|
| PRY-EJ-001 | 3 | 4 / 5 | 80 | amber |
| PRY-EJ-002 | 0 | null | | no-plan |
| PRY-EJ-003 | 6 | 30 / 36 (congeladas) | 83 | paused |
| PRY-EJ-004 | 2 | 1 / 3 | 33 | green |
| PRY-EJ-005 | 5 | 9 / 8 | 113 | red |
| PRY-EJ-006 | 4 | 5 / 6 | 83 | amber |
| PRY-EJ-007 | 0 | null | | no-plan |

## `PortfolioTable` (`frontend/components/portfolio/PortfolioTable.tsx`)

Columnas, en orden: «Proyecto», «Fase», **«Semanas de la fase»**, «Semáforo», «Próximo hito», «Responsable», «Bloqueo», «Días sin actualizar». La celda de semanas es la tercera (`cell`) de la fila.

- Fila con plan (verde, ámbar, rojo): texto `` `${active} / ${planned} sem.` `` (p. ej. «4 / 5 sem.») y una barra:
  - `role="progressbar"` con `aria-valuemin=0`, `aria-valuemax=100`, `aria-valuenow = min(percent, 100)`, `aria-valuetext = `${percent} % del plan`` (porcentaje real: 113 -> «113 % del plan», valuenow 100) y nombre accesible `` `${active} de ${planned} semanas activas, ${percent} % del plan` `` (p. ej. «4 de 5 semanas activas, 80 % del plan»).
  - Patrón de `TimingTable`: el primer hijo directo del progressbar es el relleno, con `style.width = `${min(percent, 100)}%`` y exactamente una clase de color: `bg-ok` (green), `bg-warn` (amber), `bg-bad` (red), según `phaseWeeksProgress(row).trafficLight` (no según el chip de estado). Sin colores sueltos.
- Fila en pausa (`status === "paused"`): mismo texto de semanas congeladas («30 / 36 sem.»), texto visible «Reloj parado» (solo en las filas en pausa) y la barra con relleno neutro `bg-off` (nunca `bg-ok`/`bg-warn`/`bg-bad`). Nombre accesible de la barra: `` `${active} de ${planned} semanas activas, reloj parado` `` (p. ej. «30 de 36 semanas activas, reloj parado»); `aria-valuenow`/`aria-valuetext` conservan el avance congelado («83», «83 % del plan»).
- Oportunidad (`phaseWeeks === null`): texto «Sin plan hasta promover»; sin `progressbar` ni texto «sem.».
- Sin cambios: un único enlace por fila (sin nuevos tabulables), región con scroll «Tabla de la cartera» (`overflow-x-auto`, `tabindex=0`), chips de semáforo, resto de columnas.
- Sin violaciones de jest-axe (tabla sola, `PortfolioView` cargada y `/portfolio`).

## `PortfolioView`

Sin cambios de contrato: la columna aparece en el estado cargado y se conserva al filtrar; el resumen y los filtros no cambian.

## Helper de tests

`frontend/__tests__/helpers/portfolio-rows.ts`: `makeRow` y `ROWS` llevan `phaseWeeks` (nulo para `no-plan`); en `ROWS`: 901 2/5, 902 5/6, 903 9/8, 904 (en pausa) 2/3, 905 null.
