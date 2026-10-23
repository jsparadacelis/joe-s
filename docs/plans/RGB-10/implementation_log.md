# RGB-10 · Implementation log

## Escritor de tests

Fecha: 2026-10-23

### Archivos

- `__tests__/lib/fases.test.ts`: `FASES` (8, ids 0..7, nombres del PRD, textos no vacíos), `estadoFase`/`modoFase` en las 64 combinaciones, `parseFaseId` (válidos y inválidos).
- `__tests__/lib/proyectos.test.ts`: `listarProyectos`, `obtenerProyecto` (existente/null), `obtenerEntregable` (forma de los campos, `versionCongelada` según fase, datos ficticios sin correos ni teléfonos, «(ejemplo)»).
- `__tests__/components/proyecto/PhaseTimeline.test.tsx`: nav con nombre, 8 enlaces y href, estado accesible, `aria-current` único, Tab, Enter, bordes 0/7, axe.
- `__tests__/components/proyecto/ModoBanner.test.tsx`: vacío en edición, avisos de solo lectura y vista previa, enlace «Volver a la fase actual», axe.
- `__tests__/components/proyecto/FaseEntregable.test.tsx`: los tres modos, tres tipos de campo, escritura, Guardar con/sin `onGuardar`, versión congelada, lista vacía, axe.
- `__tests__/app/proyectos.test.tsx`: `/proyectos`, `/proyectos/[codigo]` (redirect/404) y `/proyectos/[codigo]/fase/[fase]` (tres modos, 404, axe). Mock de `next/navigation` con `redirect`/`notFound` que lanzan `Error`.
- Modificados (no son producción): `__tests__/app/pages.test.tsx` y `__tests__/a11y-i18n.test.tsx` ya no incluyen `ProyectosPage`, porque pasará a ser async (Server Component con datos) y esos tests la renderizan de forma síncrona con un estado vacío; ahora se cubre en `__tests__/app/proyectos.test.tsx`.
- Sin cambios en `color-classes.test.ts`: recorre `components/` y `app/` y cubrirá los nuevos archivos.

### Cómo fallan

Los 6 suites nuevos fallan con «Could not locate module @/lib/fases / @/lib/proyectos / @/components/proyecto/* / @/app/proyectos/[codigo]/page». El resto (17 suites, 183 tests) sigue en verde.

### Huecos o ambigüedades del plan

1. Firma de las páginas: asumo Next 16, `params: Promise<{ codigo: string; fase?: string }>`, default export async; `/proyectos` sin props.
2. Los tests de página asumen que la pantalla de fase incluye `PhaseTimeline`, `ModoBanner` y `FaseEntregable`, y un único `h1`. El texto del `h1` no está definido y no se comprueba.
3. El texto accesible del estado en `PhaseTimeline` no está fijado (visible u oculto con sr-only): se comprueba que cada enlace contiene exactamente una de las palabras hecha/actual/vista. El nombre de fase «Anteproyecto» no contiene esas palabras, pero hay que evitar que el número/nombre las incluya.
4. Qué muestra `/proyectos` por proyecto (lista, tabla): se exige un enlace cuyo nombre contenga el código, con href a la fase actual, y «(ejemplo)» visible al menos 3 veces.
5. `obtenerEntregable` con código inexistente no está especificado (no se prueba). Tampoco si cada fase debe tener al menos un campo: asumo que sí (>0) en los proyectos de ejemplo, y que los ids de campo son únicos por entregable.
6. Cómo se muestra la versión congelada en solo lectura: se comprueba texto con `v1` y «congelada» en `FaseEntregable`; en edición y vista previa no debe aparecer «congelada». El banner dice «Fase cerrada · versión congelada», pero la página sí lo repite; el test de `FaseEntregable` en solo lectura usa `getByText(/congelada/i)` por lo que el componente debe mostrarlo en un único elemento.
7. `ModoBanner` usa `Notice` (`role="status"`); se asume ese rol.
8. `onGuardar`: sin argumentos definidos; solo se comprueba que se llama una vez. Se asume botón de tipo submit dentro de un `form` (o click directo; ambos valen).
9. Tipos de campo en los tests: `texto` → `input`, `area` → `textarea`, `fecha` → `input[type=date]` (el plan no lo dice explícitamente).
10. La página de fase en solo lectura/vista previa debe tener campos `textbox` (los datos de ejemplo incluyen al menos un campo de texto o área en cada fase).

## Desarrollador

Fecha: 2026-10-23

### Qué se hizo

- `lib/fases.ts`: `FASES`, `estadoFase`, `modoFase` (derivado de `estadoFase`, única fuente de verdad) y `parseFaseId` (regex `^[0-7]$`).
- `lib/proyectos.ts`: datos ficticios en un bloque marcado «DATOS DE EJEMPLO (sustituible por el cliente de la API)»; tres campos por fase (texto, área, fecha) con ids únicos; `versionCongelada = "v1"` solo en fases anteriores a la actual; `obtenerEntregable` con código inexistente devuelve campos vacíos (los tests no lo cubren).
- `components/proyecto/PhaseTimeline.tsx` (Server Component): `nav` + `ol` + 8 `Link`; cada ítem muestra número, nombre y el estado como texto visible (no solo color); la fase en pantalla lleva `aria-current="page"` y anillo (`ring-2 ring-ink`). El foco visible lo da el `:focus-visible` global con `--focus`.
- `components/proyecto/ModoBanner.tsx` (Server Component): reutiliza `Notice` (info en solo lectura, warn en vista previa) con enlace «Volver a la fase actual».
- `components/proyecto/FaseEntregable.tsx` (`"use client"`, necesario por `onSubmit`/`onGuardar`): campos no controlados (`defaultValue`), `label` asociado con `useId`; solo lectura = `readOnly` (texto/área) o `disabled` (fecha, porque `readOnly` no se aplica a `type=date`); vista previa = `disabled`; «Guardar» solo en edición.
- Rutas: `/proyectos` (lista en `Panel`, con `EmptyState` si no hay proyectos), `/proyectos/[codigo]` (redirect/404) y `/proyectos/[codigo]/fase/[fase]` (Server Component async; `h1` único vía `PageHead` con el nombre del proyecto).

### Decisiones y ambigüedades

Se adoptaron las 10 asunciones del Escritor de tests. Detalles: el estado en la línea va como texto separado por espacios (los tests lo detectan con `\b`); la versión congelada se muestra como «Versión congelada: v1» solo en `FaseEntregable`, de modo que en la página «Fase cerrada · versión congelada» sigue siendo único.

### Desviaciones

- Ninguna sobre los tests: no se modificó ningún test existente ni se añadió ninguno nuevo (los existentes cubren el código).
- `color-classes.test` solo admite clases cuyo sufijo sea un token: se evitaron `divide-y`, `ring-offset-*` y `last:border-b-0`; el anillo es `ring-2 ring-ink` sin separación.

### Resultado

`npm run lint`, `npm run typecheck`: sin errores. `npm test`: 23 suites, 359 tests en verde. `npm run build`: correcto (rutas `/proyectos/[codigo]` y `/proyectos/[codigo]/fase/[fase]` dinámicas).

## Tester

Fecha: 2026-10-23

### Qué se ejecutó

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` antes y después de mis cambios, en verde (tras ellos: 23 suites, 361 tests).
- `npm run build && npm run start` (puerto 3457) y `curl`: `/proyectos` 200; `/proyectos/PRY-EJ-001` 307 a `/fase/3`; fases 0..7 de los 3 proyectos 200; `/proyectos/NOEXISTE`, `/fase/8`, `/fase/abc`, `/fase/01`, `/fase/-1` 404. HTML servido: `aria-current="page"` solo en el ítem en pantalla; fase 1: campos readonly/disabled, aviso «Fase cerrada · versión congelada», sin «Guardar»; fase 3: «Guardar»; fase 5: 3 campos `disabled`, aviso de vista previa, sin «Guardar».
- Playwright + Chromium headless (instalado en un directorio temporal fuera del repo; no se añadió dependencia) con emulación de `prefers-color-scheme`. Tab recorre: skip link, Cartera, Proyectos, Por promover, Reporte semanal, Ajustes, fases 0..7 y «Volver a la fase actual», con outline de 2px en cada parada. Enter en campos de las fases 1 y 5: la URL no cambia y no hay envío.
- Contraste con los tokens (claro/oscuro): hecha `ok/ok-soft` 5.11/6.41, actual `on-point/point` 11.3/6.1, vista `muted/surface-2` 4.64/5.94 (pares ya cubiertos en `contrast.test.ts`); anillo `ink/bg` 15.5/14.9 (par `ink/bg` cubierto); `focus/bg` 10.4/6.1.

### Hallazgos

1. **Media, corregido.** `FASES[].entregable` y `promueve` no coincidían con la tabla del PRD (textos inventados; `promueve` era una condición en lugar del rol). Se sustituyeron por los del PRD: `entregable` = entregable de salida y `promueve` = rol con autoridad. La página de fase muestra ahora «Entregable · {fase}» con el texto del PRD y «Autoridad para promover: {rol}»; los campos de ejemplo ya no incrustan el texto del entregable.
2. **Baja, sin corregir.** El anillo `ring-ink` de la fase en pantalla apenas se distingue cuando esa fase es la actual (sobre `point`: 1.49:1 claro, 2.44:1 oscuro; contra el fondo de página sí supera 3:1), y el foco (`--focus` = `point` en claro) sobre esa tarjeta se funde con su color. Sugerencia: separar el anillo con un hueco o marcar la fase en pantalla con otro recurso.
3. **Baja, sin corregir.** El miga de pan dice «Proyectos» en las pantallas de fase; fuera del alcance de RGB-10.
4. Higiene sin hallazgos: sin secretos ni colores sueltos, sin auth/API/Docker/CI, `node_modules`, `.next` y `test-results` no versionados.

### Cambios del Tester

- `lib/fases.ts`, `lib/proyectos.ts`, `app/proyectos/[codigo]/fase/[fase]/page.tsx`: hallazgo 1.
- `__tests__/components/proyecto/FaseEntregable.test.tsx`: regresión «submit forzado y Enter no llaman a `onGuardar` en solo lectura ni vista previa».

### Pantallazos (`docs/plans/RGB-10/screenshots/`, 1440 px, build real, datos ficticios)

`fase-actual-3-{claro,oscuro}.png`, `fase-anterior-1-{claro,oscuro}.png`, `fase-siguiente-5-{claro,oscuro}.png`, `lista-proyectos-{claro,oscuro}.png`, `foco-barra-lateral-claro.png`, `foco-linea-fases-{claro,oscuro}.png`.

Defectos visuales: ninguno bloqueante; solo el hallazgo 2.
