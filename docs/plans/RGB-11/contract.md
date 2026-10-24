# RGB-11 · Contrato asumido por los tests

Firmas y textos que el Desarrollador debe respetar para que los tests (`frontend/__tests__/`) pasen. Lo que no figura aquí queda a criterio del Desarrollador (estilos, estructura interna), siempre con tokens de color y en español en la interfaz.

## `frontend/lib/portfolio.ts`

```ts
import type { PhaseId } from "@/lib/phases";

export type PortfolioStatus = "green" | "amber" | "red" | "paused" | "no-plan";

export interface PortfolioRow {
  code: string;                 // "PRY-EJ-001"
  name: string;
  phase: PhaseId;
  status: PortfolioStatus;      // "no-plan" si y solo si phase === 0
  nextMilestone: { name: string; date: string } | null; // date: ISO yyyy-mm-dd
  owner: string;
  blocker: string | null;
  daysSinceUpdate: number;      // entero >= 0
}

export interface PortfolioSummary { active: number; atRisk: number; milestonesIn7Days: number; staleSheets: number }

export const STALE_AFTER_DAYS = 7;
export const ALL_FILTER = "all";                       // centinela «Todos»
export interface PortfolioFilter { status: PortfolioStatus | typeof ALL_FILTER; owner: string }  // owner: nombre o "all"
export const STATUS_LABEL: Record<PortfolioStatus, string>; // green/amber/red = TRAFFIC_LIGHT_LABEL; paused "En pausa"; no-plan "Sin plan"

export function isStale(row: PortfolioRow): boolean;                            // daysSinceUpdate > 7 (7 no, 8 sí)
export function summarizePortfolio(rows: readonly PortfolioRow[], today: string): PortfolioSummary;
export function filterPortfolio(rows: readonly PortfolioRow[], filter: PortfolioFilter): PortfolioRow[]; // AND, conserva el orden, no muta
export function fetchPortfolio(): Promise<PortfolioRow[]>;                      // copias independientes
```

Reglas de `summarizePortfolio` (`today` = ISO `yyyy-mm-dd`, aritmética de fechas en UTC / sin zonas horarias):
- `active` = nº de filas (la cartera solo contiene proyectos activos; incluye `paused` y `no-plan`).
- `atRisk` = filas `amber` o `red`.
- `milestonesIn7Days` = filas con `nextMilestone.date` entre `today` y `today + 7 días`, ambos incluidos (día 8 y fechas pasadas no cuentan).
- `staleSheets` = filas con `isStale`.

Datos de ejemplo de `fetchPortfolio()`: >= 6 filas, códigos `PRY-EJ-\d{3}` únicos; incluye los de `listProjects()` con el mismo `name` y `currentPhase`; todos los nombres llevan «(ejemplo)»; `PRY-EJ-003` es `paused` (coherente con su pausa activa de `lib/timing.ts`); las filas de fase 0 son `no-plan` y solo ellas; hay al menos una fila de cada estado, >= 2 responsables, algún bloqueo, alguna ficha desactualizada y alguna al día. Las fechas de hito son ISO válidas.

## Componentes (`frontend/components/portfolio/`, exports con nombre)

| Archivo | Export | Props |
|---|---|---|
| `PortfolioSummary.tsx` | `PortfolioSummary` | `{ summary: PortfolioSummary }` (el tipo de `lib/portfolio`, importado con alias) |
| `PortfolioFilters.tsx` | `PortfolioFilters` | `{ owners: readonly string[]; value: PortfolioFilter; onChange: (next: PortfolioFilter) => void }` (controlado) |
| `PortfolioTable.tsx` | `PortfolioTable` | `{ rows: readonly PortfolioRow[] }` |
| `PortfolioView.tsx` | `PortfolioView` | `{ fetcher?: () => Promise<PortfolioRow[]>; today?: string }` (cliente, `"use client"`; por defecto `fetchPortfolio` y la fecha actual en ISO) |

### PortfolioSummary
- `<section aria-label="Resumen de la cartera">` (rol `region`).
- Cuatro estadísticas en este orden, cada una `div` con `<dt>` (etiqueta) y `<dd>` (valor, número en texto, `0` incluido): «Proyectos activos», «En riesgo», «Hitos en 7 días», «Fichas desactualizadas» (los `dt` tienen rol `term`; envolver en `<dl>`).

### PortfolioFilters
- Contenedor con `role="group"` y nombre «Filtros de la cartera».
- `<select>` con `<label>` «Semáforo»: opciones, en orden, «Todos» (value `all`), «En plazo» (`green`), «Atención» (`amber`), «Plan superado» (`red`), «En pausa» (`paused`), «Sin plan» (`no-plan`).
- `<select>` con `<label>` «Responsable»: «Todos» (value `all`) y luego `owners` tal cual, en el orden recibido (value = el nombre).
- `onChange` recibe el filtro completo con solo el campo cambiado actualizado. Orden de tabulación: Semáforo, Responsable.

### PortfolioTable
- Usa `Table` de `components/ui`. Caption (nombre accesible): «Proyectos de la cartera». Cabeceras, en orden: «Proyecto», «Fase», «Semáforo», «Próximo hito», «Responsable», «Bloqueo», «Días sin actualizar».
- Si hace falta, `Table` gana una prop opcional retrocompatible (p. ej. `rowClassName?: (row) => string`) para poner la clase `relative` en el `<tr>`.
- Proyecto: un único `<a>` por fila (`next/link`) con href `/projects/${code}/phase/${phase}`; su nombre accesible contiene el código y el nombre (el texto del código y el del nombre en elementos propios, p. ej. `<span>`). El enlace lleva las clases `after:absolute after:inset-0` (enlace extendido, la fila entera es clicable), el `<tr>` lleva la clase `relative`, y el enlace tiene un estilo `focus-visible:` (foco visible). No hay más enlaces ni controles tabulables por fila.
- Fase: texto `` `${phase}. ${PHASES[phase].name}` `` (p. ej. «3. Anteproyecto»).
- Semáforo: `StatusChip variant="traffic-light"` con `STATUS_LABEL[status]`; tonos: green `ok`, amber `warn`, red `bad`, paused y no-plan `off`. Los tests comprueban el punto `aria-hidden`: green `bg-ok`, amber `bg-warn`, red `bg-bad`, paused y no-plan `bg-off`.
- Próximo hito: el nombre en su propio elemento y la fecha en `<time dateTime="yyyy-mm-dd">dd/mm/aaaa</time>` (usar `formatDate` de `lib/timing`). Sin hito: texto «Sin hito próximo» (sin `<time>`).
- Responsable: el nombre. Bloqueo: el texto, o «Sin bloqueo» si es `null`.
- Días sin actualizar: «Hoy» (0), «1 día», «N días». Si `isStale(row)`, además un `StatusChip` (tono `warn`) con el texto «Desactualizada» en la misma celda (resaltado por texto, no solo por color).

### PortfolioView
- Cargando (antes de resolver): texto «Cargando la cartera…».
- Error: `Notice tone="bad"` (rol `alert`) con `error.message` si es `ApiError`, o «Ocurrió un error inesperado. Inténtalo de nuevo.» si no (sin filtrar el detalle interno), y botón «Reintentar» que vuelve a llamar al `fetcher` (vuelve a «Cargando…» y luego a la tabla o al error). Sin tabla. No actualiza el estado tras desmontar.
- Cartera vacía (`[]`): `EmptyState` con título «Aún no hay proyectos en la cartera» y descripción «Cuando se creen proyectos, aparecerán aquí con su fase y su semáforo.»; sin resumen, sin filtros, sin tabla.
- Con datos: resumen (siempre sobre toda la cartera, **no** cambia con los filtros; `today` por defecto = fecha actual ISO), filtros (opciones de responsable = únicos de todas las filas, ordenados con `localeCompare("es")`, no dependen del filtro de estado), un texto en una región `role="status"` «Mostrando N de M proyectos» (N filtradas, M total; siempre «proyectos») y la tabla con las filas filtradas.
- Filtros sin resultados: se mantiene el resumen, los filtros (con sus valores) y «Mostrando 0 de M proyectos»; no se pinta la tabla y aparece el aviso (`Notice tone="info"`) «Ningún proyecto coincide con los filtros».
- Sin violaciones de jest-axe en cargando, error, vacío, con datos, filtrado y sin resultados.

## Correcciones de la ronda 2 (F1, F2)

### F1 · Cartera ↔ proyectos
- `lib/projects.ts` añade `PRY-EJ-005` «Rehabilitación de fachada (ejemplo)» (`currentPhase` 5), `PRY-EJ-006` «Nave logística (ejemplo)» (4) y `PRY-EJ-007` «Residencia de mayores (ejemplo)» (0): mismos nombres y fase que sus filas de `fetchPortfolio`. `listProjects()` pasa a devolver 7 proyectos. Invariante: todo código de `fetchPortfolio` existe en `fetchProject` con el mismo `name` y `currentPhase`, y su página `/projects/{code}/phase/{fase}` no da 404.
- «Plan y tiempos» (`lib/timing.ts`): decisión más simple coherente con lo existente: `fetchTimingPlan` devuelve un plan de ejemplo para `PRY-EJ-005` (fase actual 5) y `PRY-EJ-006` (fase actual 4), con `activePause: null`, 7 fases y totales coherentes; `PRY-EJ-007` (fase 0) devuelve `null` y la página muestra «Sin plan hasta promover» (sin 404). Invariante: plan si y solo si `phase > 0`; `activePause !== null` si y solo si `status === "paused"`.

### F2 · Desbordamiento de la tabla
- `PortfolioTable` envuelve la `Table` en un `<div role="region" aria-label="Tabla de la cartera" tabIndex={0}>` con las clases `overflow-x-auto` y un estilo `focus-visible:` (foco visible). La tabla sigue con caption «Proyectos de la cartera».
- El texto de días de la celda «Días sin actualizar» (p. ej. «12 días») lleva `whitespace-nowrap`.
- Orden de tabulación: región de la tabla, luego un enlace por fila.

## `frontend/app/portfolio/page.tsx`
- Servidor (sin `"use client"`), `metadata.title = "Cartera"`, renderiza `<PageHead title="Cartera" description="Visión general de los proyectos activos y su estado." />` y `<PortfolioView />` (sustituye al `EmptyState` actual de la página).

## Tests existentes tocados
- `__tests__/app/pages.test.tsx`: `/portfolio` deja de esperar el estado vacío de la página (ya no es un marcador de posición); solo comprueba su cabecera. El estado vacío de la cartera lo cubre `PortfolioView.test.tsx`.
- `__tests__/a11y-i18n.test.tsx` y `color-classes.test.ts` recorren `components/`: nada de palabras inglesas en el texto de la interfaz ni colores fuera de los tokens.

## Ayudas de test
- `__tests__/helpers/portfolio-rows.ts` (`TODAY = "2026-10-24"`, `ROWS`, `makeRow`), datos ficticios compartidos.

## Ronda 3 · B1 (semáforo coherente)
- Regla: el semáforo de la cartera es siempre el de `consumptionTrafficLight(activeWeeks, plannedWeeks)` de la fase actual del plan de «Plan y tiempos» (`fetchTimingPlan`). `paused` si y solo si el plan tiene `activePause`; `no-plan` si y solo si no hay plan (fase 0).
- La fecha del próximo hito de una fila en pausa («Reanudación de la obra») es `activePause.expectedResumption` del plan (PRY-EJ-003: 2026-11-09).
- Efecto en los datos de ejemplo: PRY-EJ-001 `amber`, PRY-EJ-004 `green`, PRY-EJ-005 `red`, PRY-EJ-006 `amber`; con `TODAY = 2026-10-24` el resumen da «En riesgo» = 3 (antes 2). Siguen representados verde, ámbar, rojo, pausa y sin plan.
