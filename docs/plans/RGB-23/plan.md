# RGB-23 · Semanas de la fase y pausas en la cartera (front)

Tarea de front (P1, S, E4). Depende de RGB-22 (hecha) y de la cartera RGB-11 (front hecho, PR #32; back pendiente). Datos de ejemplo: el reloj real lo darán RGB-20 (hecha, funciones puras) y RGB-21 (pausas y persistencia, sin hacer); ver `docs/huecos-backend.md`.

Fuente: página RGB-23 del Backlog de Notion.

- Alcance: columna «Semanas de la fase» (activas / plan) coloreada por consumo y el estado «en pausa» con reloj parado.
- Criterio: las oportunidades muestran «Sin plan hasta promover».

## Archivos

Modificados: `frontend/lib/portfolio.ts` (contrato y datos de ejemplo), `frontend/components/portfolio/PortfolioTable.tsx` (columna nueva), y sus tests en `frontend/__tests__/`. Sin archivos nuevos de producción salvo que el Desarrollador extraiga una celda pequeña (`PhaseWeeksCell`).

## Contrato

- `PortfolioRow` gana `phaseWeeks: { active: number; planned: number } | null`: las semanas activas y las planificadas de la **fase actual** (las mismas que `PhaseTiming` de `lib/timing.ts`). `null` si y solo si el estado es `no-plan` (oportunidad).
- Invariante: para toda fila con plan, `phaseWeeks` es igual a `activeWeeks`/`plannedWeeks` de la fase actual de `fetchTimingPlan(code)`.
- Color: el consumo es `consumptionPercent(active, planned)` y el color el de `consumptionTrafficLight` (mismos tokens que «Plan y tiempos»); en pausa el reloj está parado: se muestran las semanas activas congeladas con la etiqueta «Reloj parado» (texto, no solo color) y no se colorea como avance.
- Texto: «{activas} / {plan} sem.» con el porcentaje accesible (`aria-label`, p. ej. «4 de 5 semanas activas, 80 % del plan»); oportunidades: «Sin plan hasta promover».

## Pantalla

Nueva columna «Semanas de la fase» en la tabla de la cartera (entre «Fase» y «Semáforo»), con barra de consumo compacta reutilizando el patrón de `components/timing/TimingTable.tsx` (sin colores sueltos, `role="progressbar"` con `aria-valuenow` acotado a 100 y `aria-valuetext` con el porcentaje real, como el pendiente de RGB-22). La región con scroll horizontal sigue funcionando.

## Criterios de aceptación

- [ ] Columna «Semanas de la fase» con activas / plan y color por consumo (verde, ámbar, rojo, con texto además de color).
- [ ] Proyecto en pausa: «Reloj parado» y semanas congeladas; no se muestra como avance.
- [ ] Oportunidades: «Sin plan hasta promover».
- [ ] El semáforo y las semanas coinciden con «Plan y tiempos» en cada fila.
- [ ] Accesible (jest-axe, contraste ≥ 4,5:1 en claro y oscuro, valuetext), en español, solo tokens, sin datos reales.
- [ ] `lint`, `typecheck`, `test` y `build` en verde; pantallazos en `docs/plans/RGB-23/screenshots/` enlazados en el PR.

Fuera de alcance: lectura real del reloj (RGB-20/21), ordenar por columna.

## Flujo

Escritor de tests → Desarrollador → Tester (build real, pantallazos) → Juez (Opus). PR solo con aprobado; monitor cada 30 s. Un solo PR; RGB-23 sí se puede cerrar en cuanto se mergee (solo front), aunque con datos de ejemplo.
