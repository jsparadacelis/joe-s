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
