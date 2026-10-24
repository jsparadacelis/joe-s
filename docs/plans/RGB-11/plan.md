# RGB-11 · Cartera del estudio (front)

Tarea full-stack (P0, M, E1). Esta entrega es **solo el front, contra datos de ejemplo**: la API de `main` no ofrece lecturas de proyectos (ver `docs/estado.md`), así que el contrato vive en `frontend/lib/portfolio.ts` y se sustituirá por el cliente de la API cuando exista `GET /api/portfolio` (parte back de RGB-11, pendiente). Misma estrategia que RGB-10, RGB-22, RGB-29 y RGB-34.

Fuente: página RGB-11 del Backlog de Notion. Alcance y criterios:

- Tabla: proyecto, fase, semáforo o «en pausa», próximo hito y fecha, responsable, bloqueo, días sin actualizar.
- Filtros por semáforo y responsable; resumen arriba de 4 cifras: activos, en riesgo, hitos en 7 días, fichas desactualizadas.
- Criterios: fichas con más de 7 días sin actualizar resaltadas; clic en una fila abre el proyecto en su fase actual.

## Archivos

Nuevos: `frontend/lib/portfolio.ts`, `frontend/components/portfolio/{PortfolioSummary,PortfolioFilters,PortfolioTable,PortfolioView}.tsx`, sus tests en `frontend/__tests__/`. Modificado: `frontend/app/portfolio/page.tsx` (servidor; sustituye el estado vacío).

## Contrato (`lib/portfolio.ts`)

- `PortfolioRow { code, name, phase: PhaseId, status: "green" | "amber" | "red" | "paused" | "no-plan", nextMilestone: { name, date } | null, owner, blocker: string | null, daysSinceUpdate }`. `no-plan` = oportunidad (fase 0), sin semáforo.
- `PortfolioSummary { active, atRisk, milestonesIn7Days, staleSheets }` calculado por una función pura `summarizePortfolio(rows, today)`; «en riesgo» = ámbar o rojo; «desactualizada» = más de 7 días sin actualizar (constante `STALE_AFTER_DAYS = 7`).
- `filterPortfolio(rows, { status, owner })`; `fetchPortfolio()` devuelve filas de ejemplo (los `PRY-EJ-00N` de `lib/projects.ts` más algunos ficticios) coherentes con la fase de `lib/projects.ts`.
- Los semáforos reutilizan `TrafficLight` y sus etiquetas de `lib/timing.ts`.

## Pantalla

`/portfolio` (servidor, `PageHead`) + `PortfolioView` (cliente, `fetcher` inyectable). Resumen de 4 cifras, filtros con `<select>` etiquetados (todos / semáforo; todos / responsable), tabla accesible con la fila entera enlazada a `/projects/[code]/phase/[fase actual]`. Fichas desactualizadas resaltadas con texto («Desactualizada») además del color. Estados: cargando, error con «Reintentar», sin resultados con los filtros («Ningún proyecto coincide con los filtros») y cartera vacía (estado vacío actual). Todo en español, solo tokens de color, claro y oscuro.

## Criterios de aceptación

- [ ] Resumen con 4 cifras coherentes con la tabla.
- [ ] Filtros por semáforo y por responsable (combinables); sin resultados con aviso.
- [ ] Fichas con más de 7 días sin actualizar resaltadas (texto, no solo color).
- [ ] Clic en una fila abre el proyecto en su fase actual (teclado incluido).
- [ ] Accesible (etiquetas, foco, jest-axe, contraste en ambos temas); todo en español; solo tokens; sin datos reales; código y tests en inglés.
- [ ] `lint`, `typecheck`, `test` y `build` en verde.
- [ ] Pantallazos en `docs/plans/RGB-11/screenshots/` (cartera, filtrada, sin resultados, error, claro y oscuro) enlazados en el PR.

Fuera de alcance: lectura real de la API (parte back), RGB-23 (columna de semanas y pausas, siguiente PR), ordenación de columnas.

## Flujo

Escritor de tests (Sonnet) → Desarrollador (Sonnet) → Tester (Sonnet, build real, pantallazos) → Juez (Opus). PR solo con aprobado; monitor cada 30 s.
