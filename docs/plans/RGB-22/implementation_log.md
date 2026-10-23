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

## Tester

Fecha: 2026-10-23

### Qué se ejecutó

- `npm run lint`, `typecheck`, `test`, `build` antes y después de mis cambios, en verde (tras ellos: 30 suites, 496 tests).
- Build real + `npm run start` (puerto 3472) y `curl`: `/proyectos` 200; `/proyectos/PRY-EJ-001` 307 a `/fase/3`; `/fase/0..7` 200 con un único h1 (modos: fases 0 y 1 solo lectura con «Fase cerrada · versión congelada», fase 3 con «Guardar», fase 5 vista previa con campos `disabled`); `/fase/8`, `/proyectos/NOEXISTE` y `/proyectos/NOEXISTE/plan-y-tiempos` 404; plan-y-tiempos de PRY-EJ-001/002/003 200. HTML servido: `aria-current="page"` en la pestaña «Plan y tiempos» (y en «Fase y promoción» en las rutas de fase), 7 `progressbar` con `aria-label` «Consumo de {fase}», `aria-valuemin/max/now`; PRY-EJ-001: 11 / 64 sem, 4 sem en pausa, 15 sem de calendario, +1 sem de desviación, fase actual 80 % Atención, filas 150 % y 133 % «Plan superado»; PRY-EJ-003: un `role="status"` con motivo y reanudación 09/11/2026; PRY-EJ-002: «Sin plan hasta promover», sin tablas ni progressbars.
- Playwright (`playwright-core` en directorio temporal fuera del repo, Chromium headless shell ya instalado, locale `es-ES`, ancho 1440): Tab desde la página recorre skip link, 5 ítems de la barra lateral, «Fase y promoción» y «Plan y tiempos», todos con outline sólido de 2 px (`focus` en las pestañas, `focus-on-side` en la barra).
- Contraste (tokens claro/oscuro): barra ok/warn/bad sobre `surface-2`: 5.12/4.74/6.03 y 6.82/7.55/5.81; sobre `surface`: 6.16/5.70/7.25 y 7.94/8.80/6.77 (todas >= 3:1). Etiquetas de semáforo `ok/ok-soft` 5.11/6.41, `warn/warn-soft` 4.77/6.83, `bad/bad-soft` 5.75/5.75; «Pendiente» `muted/surface-2` 4.64/5.94; «Actual» `point/point-soft` 9.10/4.88. Pestañas: activa `ink/surface-2` 14.01/11.75, inactiva `muted/bg` 5.13/7.54, borde `point/bg` 10.36/6.10. Todo >= 4.5:1 en texto.

### Criterios

Todos cumplen (ver informe del Tester). El front muestra los números del contrato sin recalcular; el semáforo se verifica en 79/80/100/101 % en `lib` (batería existente) y en la UI (test añadido).

### Hallazgos

1. **Baja, sin corregir.** `aria-valuenow` puede superar `aria-valuemax` (150 y 133 en PRY-EJ-001), lo que ARIA no permite estrictamente; el plan y los tests exigen el valor real. Alternativa si se quiere estricto: `aria-valuemax` = máximo real, o `aria-valuetext` con el porcentaje y mantener 100 en `valuenow`.
2. **Baja, sin corregir.** En PRY-EJ-003 las fases hechas con consumo exactamente 100 % muestran «Atención» (regla del plan: 100 % = ámbar). Es coherente con el contrato, pero puede leerse como alerta en fases ya cerradas.
3. **Baja, sin corregir.** La pestaña activa se distingue por fondo `surface-2` y borde inferior `point` (poco contraste entre fondo de pestaña y de página); legible, pero sutil. No hay solapes ni texto cortado.
4. Higiene sin hallazgos: sin secretos ni colores sueltos, sin auth/API/Docker/CI, `node_modules`, `.next` y `test-results` no versionados.

### Cambios del Tester

- `__tests__/components/tiempos/TablaTiemposFronteras.test.tsx`: regresión de las fronteras del semáforo en la UI (79/80/100/101 % con plan 100; el redondeo de 79,6 % no cambia el semáforo).
- Pantallazos.

### Pantallazos (`docs/plans/RGB-22/screenshots/`, 1440 px, build real, datos ficticios)

`plan-y-tiempos-PRY-EJ-001-{claro,oscuro}.png`, `plan-y-tiempos-pausa-activa-PRY-EJ-003-{claro,oscuro}.png`, `plan-y-tiempos-sin-plan-PRY-EJ-002-{claro,oscuro}.png`, `fase-con-pestanas-PRY-EJ-001-{claro,oscuro}.png`, `foco-pestana-fase-y-promocion-{claro,oscuro}.png`, `foco-pestana-plan-y-tiempos-{claro,oscuro}.png`.

Defectos visuales: ninguno bloqueante; solo el hallazgo 3.
