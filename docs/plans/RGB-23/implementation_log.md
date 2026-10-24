# Registro de ejecución · RGB-23 Semanas de la fase y pausas en la cartera (front)

Estado a 2026-10-24: **front hecho contra datos de ejemplo.** El reloj real lo darán RGB-20 (hecha, funciones puras) y RGB-21 (pausas y persistencia, sin hacer) y la cartera real, la parte back de RGB-11; ver [docs/huecos-backend.md](../../huecos-backend.md). Al ser una tarea solo de front, RGB-23 se puede cerrar con este PR, con la salvedad de los datos de ejemplo.

## Qué se hizo

- Plan: [plan.md](plan.md). Contrato: [contract.md](contract.md).
- `PortfolioRow.phaseWeeks` (`{ active, planned } | null`, semanas de la fase actual; `null` solo en oportunidades) y la función pura `phaseWeeksProgress` (porcentaje y semáforo reutilizando `consumptionPercent` y `consumptionTrafficLight`) en `frontend/lib/portfolio.ts`.
- Columna «Semanas de la fase» en `PortfolioTable` (celda `PhaseWeeksCell`) con barra de consumo: texto «{activas} / {plan} sem.», `progressbar` con `aria-valuenow` acotado a 100 y `aria-valuetext` con el porcentaje real (113 % se ve como barra llena y «113 % del plan»), color por tokens con texto además de color.
- En pausa: «Reloj parado», barra neutra (`bg-off`) con el avance congelado. Oportunidades: «Sin plan hasta promover» sin barra.

## Flujo

Escritor de tests (40 tests en rojo; helper `portfolio-rows.ts` y la prueba de cabeceras ajustados con comentario) → Desarrollador (1156 tests, lint, typecheck y build en verde) → Tester con el build real → Juez.

- El Tester comprobó fila a fila que semanas y color coinciden con «Plan y tiempos» (excepto la fila en pausa, que por contrato se muestra neutra), axe sin violaciones en claro y oscuro, sin scroll horizontal de página a 1440/1024/800 px y a 200 % de zoom, y que el enlace estirado cubre la celda nueva.
- Observación del Tester: la barra de pausa en tema claro (`bg-off`) da 3,13:1 frente a la celda. Cumple el 3:1 de WCAG para componentes gráficos y el significado lo da el texto «Reloj parado».

## Decisiones

- El color de la barra sale de `phaseWeeksProgress`, no del chip de estado: una fila en pausa no se colorea como avance.
- Una sola clase de color en el relleno y `style.width = min(percent, 100) %`.

## Juez

Aprobado a la primera, sin bloqueantes. Comprobó a mano que la cartera no contradice a «Plan y tiempos» en ninguna de las 7 filas (lección del rechazo B1 de RGB-11) y que cada coincidencia tiene un test. La barra de pausa (`bg-off`, 3,13:1 frente a la celda) pasa el 3:1 de WCAG 1.4.11 y el significado nunca depende solo de la barra: queda como seguimiento.

## Seguimientos

- Sustituir `phaseWeeks` por el valor que devuelva la API cuando existan RGB-20/21 y `GET /api/portfolio` (ver el log de RGB-11).
- Contraste de `bg-off` (`frontend/app/globals.css`, `--off` en claro): 2,83:1 frente a la pista `surface-2`; si se quiere más, oscurecerlo y repasar las demás barras sobre `surface-2`, incluida `TimingTable`.
- `BAR_COLOR` está duplicado en `PortfolioTable.tsx` y `TimingTable.tsx`: extraer una barra de consumo compartida; arreglaría también el `aria-valuenow` sin acotar de `TimingTable` (pendiente de RGB-22).
- `frontend/__tests__/lib/portfolio.test.ts` (invariante B1) compara `phase: current.phase` consigo mismo; debería comparar `r.phase` (hoy la fase la cubre `timing.test.ts`).
- Heredados de RGB-11: columna «Proyecto» fija en el scroll horizontal, contorno de foco sobre toda la fila, aviso `act(...)` de `next/link` en los tests de `PortfolioTable`.

## Pantallazos

En [screenshots/](screenshots/) (datos ficticios, claro y oscuro): cartera completa, filtrada por «En pausa» y «Sin plan», detalle de la columna, 1024 y 800 px con scroll interno, foco de teclado, zoom 200 % y «Plan y tiempos» de PRY-EJ-001 y PRY-EJ-005 para ver la coincidencia.
