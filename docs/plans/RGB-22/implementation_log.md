# RGB-22 · Implementation log

## Escritor de tests

Fecha: 2026-10-23

### Archivos

- `__tests__/lib/tiempos.test.ts`: `porcentajeConsumo` (redondeo, plan 0 o negativo, activas 0, >100), `semaforoConsumo` en todas las fronteras (planes 2, 3, 5, 10, 36, 100 y 500; 79/80/99/100/101 %; plan 0; fase futura; el semáforo usa el valor real y no el porcentaje redondeado), `ETIQUETA_SEMAFORO` y `ETIQUETA_MOTIVO` con textos exactos, `obtenerPlanTiempos` (PRY-EJ-001 y 003 con los valores del plan, PRY-EJ-002 y códigos inexistentes → null, copias no mutables) y coherencia de los datos de ejemplo (ids de fase únicos y ordenados, fechas ISO válidas, historial de más reciente a más antiguo, datos ficticios).
- `__tests__/components/proyecto/ProyectoTabs.test.tsx`: nav «Secciones del proyecto», textos y href, `aria-current` según `usePathname` (cualquier `/fase/N`, `plan-y-tiempos`, otras rutas), Tab, Enter, axe.
- `__tests__/components/tiempos/ResumenTiempos.test.tsx`: valores del servicio tal cual, no recalcula (totales incoherentes), desviación positiva/negativa/cero, fase actual con % y etiqueta, `Notice` (`role="status"`) con motivo y reanudación solo con `pausaActiva`, axe.
- `__tests__/components/tiempos/TablaTiempos.test.tsx`: cabeceras, 7 filas, plan/activas/pausa, Estado Hecha/Actual/Pendiente, `progressbar` (min, max, now, nombre), porcentaje en texto, etiqueta del semáforo en texto (rojo, rojo, ámbar; verde; límite 100 % = Atención), axe.
- `__tests__/components/tiempos/HistorialPausas.test.tsx`: cabeceras, filas, «en curso», fechas, fase, etiqueta del motivo, semanas, «Sin pausas registradas», axe.
- `__tests__/app/plan-y-tiempos.test.tsx`: página (404, PRY-EJ-001 completa con un h1, PRY-EJ-003 con aviso de pausa, PRY-EJ-002 «Sin plan hasta promover») y `layout.tsx` (pestañas antes de `children`, enlaces, 404, axe).
- Sin cambios en `color-classes.test.ts`: ya recorre `app/` y `components/` completos, así que cubrirá `components/tiempos/` y `ProyectoTabs.tsx`.

### Cómo fallan

6 suites nuevas fallan con «Could not locate module» (`@/lib/tiempos`, `@/components/proyecto/ProyectoTabs`, `@/components/tiempos/*`, `@/app/proyectos/[codigo]/plan-y-tiempos/page`). Las otras 23 suites (361 tests) siguen en verde.

### Ambigüedades del plan (los tests solo comprueban lo fijado)

1. Formato de fechas en pantalla (resumen, historial): no fijado; se acepta ISO, `dd/mm/aaaa` o «14 de diciembre».
2. Formato del porcentaje: se acepta `80%` y `80 %` (`/80\s?%/`).
3. Formato de las estadísticas: se exigen las frases del plan («11 / 64 sem», «4 sem en pausa», «15 sem de calendario», «+1 sem de desviación»); espacios flexibles. Cada frase debe estar en un único elemento de texto (`getByText`). Desviación negativa: signo `-` o `−`; cero sin «+».
4. Límite del 100 % de la barra: el plan no fija el mecanismo. Solo se verifica `aria-valuenow` real (150) y que ningún `style.width` en línea de la barra o sus hijos supere el 100 %.
5. Filas con 0 activas en `TablaTiempos`: no se comprueba si muestran etiqueta de semáforo.
6. Columna Fase: se comprueba que la fila contiene el nombre de la fase; en `HistorialPausas`, nombre o «Fase N».
7. Estructura de `ResumenTiempos` (tarjetas): no se comprueba; el aviso de pausa debe ser el único `role="status"` del componente y contener «pausa».
8. Historial de PRY-EJ-001: el plan no da fechas ni fases de las 2 pausas; solo se exige que las semanas sumen `totalPausaSemanas` (4) y la coherencia general. Si la pausa activa de PRY-EJ-003 está o no en `pausas` no se comprueba.
9. Los tests de página y layout usan los datos de ejemplo reales; asumen `Page({ params: Promise<{codigo}> })` y `Layout({ params, children })` async, con la página de plan con un único h1 (también en el estado vacío) y dos tablas en PRY-EJ-001.
10. `obtenerPlanTiempos` devuelve copias (test añadido por coherencia con `lib/proyectos.ts`; si el Desarrollador prefiere datos inmutables compartidos, debe devolver copias igualmente).

## Desarrollador

Fecha: 2026-10-23

### Qué se hizo

- `lib/tiempos.ts`: tipos del contrato, `ETIQUETA_MOTIVO`, `ETIQUETA_SEMAFORO`, `porcentajeConsumo`, `semaforoConsumo`, `formatearFecha` (ISO a `dd/mm/aaaa` sin `Date`) y `obtenerPlanTiempos` con datos de ejemplo en un bloque «sustituible por el cliente de la API», que devuelve copias.
- `components/proyecto/ProyectoTabs.tsx` (Client Component, `usePathname`).
- `components/tiempos/{ResumenTiempos,TablaTiempos,HistorialPausas}.tsx`, reutilizando `Table`, `Notice`, `StatusChip`.
- `app/proyectos/[codigo]/layout.tsx` (fragmento: pestañas + `children`, 404 si no existe) y `app/proyectos/[codigo]/plan-y-tiempos/page.tsx`.
- Los tests escritos no se tocaron.

### Decisiones

- Semáforo con enteros, sin redondeo ni coma flotante: rojo si `activas > plan`; ámbar si `activas*5 >= plan*4`. `porcentajeConsumo` solo se usa para mostrar. Una sola fuente de verdad para ambos, usada por resumen y tabla.
- Barra: `role="progressbar"` con `aria-valuenow` real (puede ser 150) y relleno en línea `min(porcentaje, 100)%`; color con `bg-ok`/`bg-warn`/`bg-bad` sobre `bg-surface-2`.
- Filas con 0 activas (fases futuras): se muestra el 0 % pero no etiqueta de semáforo («En plazo» en una fase sin empezar induciría a error). Resuelve la ambigüedad 5.
- Fechas en pantalla `dd/mm/aaaa`; porcentaje `80 %`; desviación `+N` / `0` / `-N`.
- Layout devuelve un fragmento para conservar el `gap` del `main` del shell; el h1 sigue en cada página (uno por pantalla). Las páginas de plan usan el nombre del proyecto como h1, como la de fase.
- Pestañas: el color-classes test rechaza `border-b-2` y `border-transparent`; la activa se distingue con `border-point` + `bg-surface-2` + `aria-current`.
- Datos de ejemplo no fijados por el plan: PRY-EJ-001 con pausas 2026-08-03 (1 sem, fase 3) y 2026-05-04 (3 sem, fase 2); PRY-EJ-003 con totales 54 / 64 / 3 / 57 / 0 y pausa activa desde 2026-10-12, reanudación 2026-11-09 (también figura en el historial como «en curso»).
- `TONO_SEMAFORO` (semáforo a tono de `StatusChip`) vive en `ResumenTiempos.tsx` y lo importa `TablaTiempos`.

### Desviaciones

Ninguna; no hay tests que se considere incorrectos.

### Resultados

`npm run lint`, `typecheck`, `test` (29 suites, 491 tests) y `build` en verde. Pantallazos pendientes para el Tester.
