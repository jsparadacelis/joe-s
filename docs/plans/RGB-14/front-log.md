# RGB-14 · Registro del frente front

Rama `feat/RGB-14-front`. Contrato: [contract.md](contract.md). Los cuatro roles (Escritor de tests, Desarrollador, Tester, verificación) los ha ejecutado una sola sesión de orquestación en secuencia, sin subagentes separados ni Juez independiente: el veredicto queda para el Integrador y el Juez de la tarea completa.

## 1. Escritor de tests (rojo primero)

Tests escritos antes que el código; la primera ejecución falló en las 5 suites nuevas o modificadas por módulos inexistentes (`@/lib/scoring`, `ScoringForm`, `ScoringSettingsEditor`, páginas).

- `__tests__/lib/scoring.test.ts` (30): criterios y etiquetas, `computeScore` (todo a 3 = 60, 5 = 100, 1 = 20, escalado de pesos, pesos distintos = 52, redondeo a 1 decimal), `recommend` en el límite (60/60 perseguir, 60,1 y 59,9), `formatScore`, `validateScoringSettings` (límites 0 < peso ≤ 10, 2 decimales, umbral entero 1–100) y el cliente (`GET/PUT` ajustes, `POST/GET` scoring, `scoring_not_found` → `null`, `project_not_found` se relanza).
- `__tests__/components/scoring/ScoringForm.test.tsx` (25): siete selectores accesibles, nota y recomendación en vivo (incluido el límite 60), texto «la decisión es de la persona», pesos/umbral configurados, guardado (valor devuelto por la API, no el en vivo), historial, doble envío, errores 422 con `field` junto al selector con foco, 409/404/genérico en alerta enfocada, `aria-live`, axe.
- `__tests__/components/settings/ScoringSettingsEditor.test.tsx` (23): carga/reintento, límites, mensajes, 422 `invalid_weights`/`invalid_threshold`, foco restaurado, `aria-live`, axe.
- `__tests__/app/scoring-page.test.tsx` (12): página con fetch simulado (proyecto real, sin scoring, `PRY-EJ-00N` → «Sin API» sin llamadas, fase > 0 → fase 0 obligatoria con historial, fallos de ajustes/scoring, 404) y enlace «Puntuar oportunidad» (solo real y fase 0).
- `__tests__/app/settings.test.tsx`: +1 (la página monta el editor; se añade un `jest.mock` del nuevo editor, igual que el del plan; no se debilita ningún test).

## 2. Desarrollador

`lib/scoring.ts`, `components/scoring/{ScoringForm,ScoringHistory}.tsx`, `components/settings/ScoringSettingsEditor.tsx`, `app/projects/[code]/scoring/page.tsx`, sección en `app/settings/page.tsx` y enlace (`ButtonLink`) en `app/projects/[code]/phase/[phase]/page.tsx` (solo proyecto real, fase 0 vista y actual). Solo tokens de Tailwind (`bg-surface-2`, `text-bad`, `border-hair`...), reutiliza `Panel`, `Table`, `Button`, `Notice`, `StatusChip`, `EmptyState`.

Corrección posterior al rojo/verde: los pantallazos mostraron los siete pesos en rojo ante un error de un solo peso; se añadió un test (`marks only the offending weight`) y ahora solo se marca el peso afectado (un error del servidor, que no nombra criterio, marca todos). Es un test nuevo, no un cambio de ninguno existente.

## 3. Tester

- Build real (`NEXT_PUBLIC_API_URL=http://127.0.0.1:8765 npm run build` + `next start -p 3100`) contra un stub fuera del repo con datos ficticios (proyectos de ejemplo `PRY-2026-001..003` y pesos/umbral con estado), CORS y la fórmula del contrato. Los errores 422/409/404 del guardado se fuerzan interceptando la llamada del navegador. No se ha escrito contra Cloud Run ni hay datos reales.
- Playwright (`es-ES`), claro y oscuro a 1024 px y a 800 px: 15 estados × 4 variantes = 60 comprobaciones axe (wcag2a/aa, 2.1 aa, best-practice), 0 violaciones, incluida la regla `color-contrast` (≥ 4,5:1).
- Comprobado: foco al primer criterio sin puntuar, en el selector del 422 y en la alerta del 409; un único POST con doble clic; foco devuelto a «Guardar puntuación»; sin desbordamiento horizontal a 1024 ni 800 px; enlace solo en fase 0 real (ni en `PRY-EJ-002` fase 0 ni en proyectos de fase 2); peso `1e1` aceptado (= 10).
- Pantallazos en [screenshots/](screenshots/): `scoring-{empty,error-missing,live-pursue,live-no-pursue,server-422,server-409,server-404,saved,existing,sample,past-phase}`, `settings-scoring{,-error,-saved}`, `phase0-link`, cada uno `-light`/`-dark` a 1024 px y `-800-light`/`-800-dark`.
- Los pantallazos de página completa muestran la barra lateral y la barra superior en mitad de la imagen cuando la página es más alta que la ventana: es el efecto de la captura completa con elementos fijos, anterior a RGB-14.

## 4. Verificación

`lint` y `typecheck` sin avisos; `jest`: 67 suites, 1435 tests en verde (antes 1345: +90). `build` en verde (aparece `/projects/[code]/scoring`).

## Desviaciones y puntos abiertos

- El contrato no fija los mensajes de error 422 de pesos/umbral; el front valida con los suyos (`Cada peso debe ser un número mayor que 0 y como máximo 10, con hasta 2 decimales.` / `El umbral debe ser un número entero entre 1 y 100.`) y muestra tal cual el mensaje de la API cuando el servidor rechaza. Hay que alinearlos con los del back en la integración.
- El redondeo del cliente es `Math.round` (medio hacia arriba); el del back puede diferir en empates exactos de 0,05. La nota que se muestra tras guardar es siempre la de la API.
- Sin integración real con el back todavía: lo verificado es contra el contrato con un stub.
