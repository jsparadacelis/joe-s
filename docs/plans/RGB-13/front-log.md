# Registro del frente FRONT · RGB-13 Alta de oportunidad

Rama `feat/RGB-13-front` (sobre `feat/RGB-13`). Contrato: [contract.md](contract.md), sin cambios. Solo se tocó `frontend/` y este directorio. Los roles (Escritor de tests, Desarrollador, Tester) se hicieron en secuencia en una sola sesión: tests en rojo (commit `d973f8f`) y después la implementación.

## Qué se hizo

- `frontend/lib/opportunities.ts`: tipos, `validateOpportunity` (todos los errores a la vez, mismos límites y formato de mensaje que la API), `toOpportunityPayload`, `createOpportunity` sobre `lib/api.ts`.
- `lib/api.ts`: `ApiError.field` (`detail.field` del 422).
- `components/opportunities/OpportunityForm.tsx` y `app/opportunities/new/page.tsx` («Nueva oportunidad», `PageHead`): etiquetas, «Opcional», `aria-invalid`/`aria-describedby`, foco al primer error (en el orden del contrato), 422 con `field` junto al campo, otros errores y error de red en un aviso, «Guardando…» con el botón deshabilitado y `aria-busy`, éxito → `/portfolio`. Enlace «Cancelar».
- `components/ui/ButtonLink.tsx` (enlace con aspecto de botón; `buttonClassName` compartido con `Button`) y botón «Nueva oportunidad» en la cabecera de `/portfolio`.
- `lib/portfolio.ts`: `fetchPortfolio(request)` lee `GET /api/portfolio` y devuelve `{ asOf, rows }`. Estado `unknown` («Sin calcular», tono neutro, opción del filtro, fuera de «En riesgo»); hito con fecha nula («Sin fecha», no cuenta en «Hitos en 7 días»); responsable = `owner_name ?? owner_id ?? «Sin responsable»` (los vacíos cuentan como ausentes); `phaseWeeks` nulo → «Sin plan hasta promover» (no-plan) o «Sin calcular» (resto); el resumen usa `as_of` (la prop `today` sigue mandando; si `as_of` viene vacío, la fecha de hoy).
- `lib/projects.ts`: `fetchProject` lee `GET /api/projects/{code}` (404 `project_not_found` → `null`; cualquier otro fallo se lanza, no se disfraza de 404) y `listProjects` junta los proyectos reales (de `GET /api/portfolio`) con los de ejemplo.

## Cómo conviven el código real y los PRY-EJ-00N

- Un código que coincide con un proyecto de ejemplo (`PRY-EJ-00N`) se sirve en local y no toca la red; cualquier otro código va a la API.
- Los entregables, la referencia catastral, datos técnicos, relieve y «Plan y tiempos» siguen siendo de ejemplo. Un proyecto real recibe entregable vacío (sin campos) y «Plan y tiempos» muestra «Sin plan hasta promover» (no se inventa ningún plan).
- `listProjects` pone primero los reales; si la API falla, devuelve solo los de ejemplo (para que esas pantallas no se rompan). `/projects` pasa a `force-dynamic`: antes era estática y habría congelado la lista en el build. El panel ya no se llama «de ejemplo» y dice que los `PRY-EJ-NNN` son ficticios.

## Tests

- Nuevos: `lib/opportunities`, `OpportunityForm`, `/opportunities/new`, `ApiError.field`, mapeo de `fetchPortfolio`, estados «Sin calcular»/«Sin fecha»/sin semanas en la tabla, botón en `/portfolio`, proyecto real en las pantallas de proyecto.
- Datos de ejemplo de la cartera: salieron de `lib/portfolio.ts` y viven como fixtures en `__tests__/helpers/portfolio-sample.ts` (con `toApiPortfolio`/`apiProject` para simular la API).
- Reescritos (justificado en comentarios): los tests «sample data» de `fetchPortfolio` (forma, coherencia con `lib/projects.ts`, invariantes B1 de RGB-11 y RGB-23 contra `lib/timing.ts`) comprobaban que fixtures escritos a mano coincidían entre sí; con datos reales el estado, las semanas y los hitos vienen de la API, así que se sustituyeron por pruebas del mapeo (forma exacta, estados, nulos, orden, errores, ida y vuelta de los fixtures). La coincidencia cartera↔«Plan y tiempos» de los PRY-EJ se conserva en `timing.test.ts` y `projects.test.tsx` contra los fixtures; el test de página RGB-23 ahora comprueba semanas, color y barra contra `phaseWeeksProgress` de lo que manda la API.
- Ajustados: `PortfolioView` (el `fetcher` devuelve `{ asOf, rows }`), filtro de semáforo (+«Sin calcular»), pantallas de proyecto (los tests de «no existe → 404» instalan un stub 404 de la API: `__tests__/helpers/mock-api.ts`).
- Resultado: `npm --prefix frontend run lint`, `typecheck`, `test` (58 suites, 1270 tests) y `build` en verde.

## Prueba en navegador real

Build real (`next start`, puerto 3000) contra un servidor stub FUERA del repo que implementa el contrato (POST `/api/opportunities`, GET `/api/portfolio`, GET `/api/projects/{code}`, CORS para `http://localhost:3000`) y Playwright, en claro y oscuro: cartera con proyectos sembrados (ficticios) → botón → formulario vacío → envío vacío (5 errores, foco en «Nombre») → error de cliente en el presupuesto → 422 del servidor junto a «Cliente» (con los datos conservados) → error de red (petición abortada) → «Guardando…» → cartera con la oportunidad «Sin plan hasta promover» → clic abre la ficha (sin 404) → «Plan y tiempos» → código inexistente 404 → `/projects` con reales y ejemplo → PRY-EJ-001 y PRY-EJ-003 siguen abriendo. axe sin violaciones en cada pantalla. Pantallazos en [screenshots/](screenshots/) (`front-*.png`, claro y oscuro).

## Desviaciones del contrato y decisiones

- Ninguna desviación del contrato. El contrato no fija los motivos de los mensajes «no es válido: {motivo}.»; los del cliente son: «debe tener como máximo N caracteres», «elige una de las tipologías disponibles», «debe ser un número», «no puede ser negativo», «admite como máximo 2 decimales», «no puede superar 1.000.000.000 €», «debe ser una fecha con formato aaaa-mm-dd». Si el back usa otro motivo, el texto cambia según el origen del error (el prefijo y la etiqueta coinciden). Conviene alinearlos en la integración.
- El presupuesto se escribe como texto (admite coma o punto decimal, sin separador de miles; «1.234» se rechaza por tener 3 decimales) y se envía como número.
- El estado `unknown` también se aplica a cualquier `status` que el cliente no conozca.
- `fetchPortfolio` devuelve `{ asOf, rows }` en vez de un array (hace falta `as_of`).

## No verificado / seguimientos

- Nada contra el back real ni contra Cloud Run: solo el stub. Hay que repetir el recorrido en la integración.
- Los mensajes 422 reales del back (texto de los motivos) no se han visto.
- `/opportunities/new` no marca ningún elemento de la barra lateral como activo (no hay entrada de navegación para ella).
- CORS: el front llama al back desde el navegador (`NEXT_PUBLIC_API_URL`, por defecto `http://localhost:8000`); el back debe permitir el origen del front. Las pantallas de proyecto llaman desde el servidor de Next.
