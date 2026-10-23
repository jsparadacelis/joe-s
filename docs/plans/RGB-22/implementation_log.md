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
