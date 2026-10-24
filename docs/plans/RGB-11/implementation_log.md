# Registro de ejecución · RGB-11 Cartera del estudio (parte de front)

Estado a 2026-10-24: **front hecho contra datos de ejemplo; RGB-11 NO se cierra.** La tarea es full-stack y falta el backend (`GET /api/portfolio`): ver [backend-analysis.md](backend-analysis.md), [docs/huecos-backend.md](../../huecos-backend.md) y las decisiones pendientes. En Notion la tarea no pasa a «En revisión» ni «Hecho» con este PR; queda anotada como «front hecho, back pendiente».

## Qué se hizo

- Plan: [plan.md](plan.md). Contrato asumido y rondas de corrección: [contract.md](contract.md).
- `frontend/lib/portfolio.ts` (contrato, resumen, filtros, datos de ejemplo), `frontend/components/portfolio/{PortfolioSummary,PortfolioFilters,PortfolioTable,PortfolioView}.tsx` y `frontend/app/portfolio/page.tsx`; `Table` gana la prop opcional `rowClassName`.
- Proyectos de ejemplo `PRY-EJ-005`, `006` y `007` en `lib/projects.ts` y planes de ejemplo para 005 y 006 en `lib/timing.ts` (007 es oportunidad: «Sin plan hasta promover»), para que cada fila de la cartera abra una página real.

## Flujo (4 subagentes, 3 rondas)

1. **Ronda 1:** Escritor de tests (96 tests en rojo), Desarrollador (verde; un test mal escrito, que contaba también las `<option>` del filtro, se acotó a la tabla), Tester (build real).
   - F1: 3 de 7 filas llevaban a 404 (los proyectos de ejemplo solo llegaban a PRY-EJ-004).
   - F2: la tabla desbordaba la página a 1024 y 800 px.
   - Corregido: invariante cartera↔proyectos↔planes, región con scroll horizontal accesible («Tabla de la cartera») y `whitespace-nowrap` en los días. Un test de teclado se ajustó con justificación (la región es ahora una parada de Tab).
2. **Ronda 2:** segunda pasada del Tester: pasa (28 pantallazos, axe sin violaciones, contrastes ≥ 4,5:1).
3. **Juez, primera vez: rechazado (B1).** El semáforo de la cartera contradecía el de «Plan y tiempos» en 3 de 4 proyectos con plan (PRY-EJ-001, 004 y 006) y la fecha de reanudación de PRY-EJ-003 difería. La invariante no comprobaba el semáforo.
4. **Ronda 3:** nuevos tests (el semáforo de la cartera es siempre `consumptionTrafficLight` de la fase actual del plan; la fecha del hito de una pausa es la reanudación prevista) y datos corregidos: 001 ámbar, 004 verde, 006 ámbar, 003 con hito el 09/11/2026. «En riesgo» pasa de 2 a 3.

## Decisiones

- Activos = todas las filas de la cartera (incluidas las pausadas y las sin plan); el resumen no cambia con los filtros.
- Fila clicable con un único enlace extendido (`after:absolute after:inset-0`); fichas desactualizadas con el chip «Desactualizada», no solo con color.
- Cartera vacía, error con «Reintentar» y «sin resultados con los filtros» son estados distintos.

## Seguimientos

- Al conectar `GET /api/portfolio`: mapear snake_case → camelCase y `no_plan` → `no-plan`; añadir el estado `unknown` («Sin calcular», fuera de «En riesgo»); admitir hito con fecha nula; recibir `owner_id` y `owner_name`; usar `as_of` como fecha de referencia del resumen.
- `todayIso()` de `PortfolioView` usa la fecha UTC del navegador; puede desfasarse un día respecto a Europe/Madrid hasta tener `as_of`.
- Opcionales: columna «Proyecto» fija al hacer scroll horizontal; contorno de foco sobre toda la fila.
- Los hitos de ejemplo tienen fechas fijas: «Hitos en 7 días» irá bajando a 0 con el tiempo.
- El aviso `act(...)` de `next/link` sigue saliendo en los tests de `PortfolioTable`; solo se silenció en `PortfolioView`.

## Pantallazos

En [screenshots/](screenshots/) (datos ficticios, claro y oscuro): cartera completa, filtrada por semáforo y por responsable, sin resultados, error, vacía, foco de teclado, 1024 y 800 px (con scroll interno) y «Plan y tiempos» de PRY-EJ-001 y PRY-EJ-007.
