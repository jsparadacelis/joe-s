# Registro de ejecución · Conexión del front con la API y ajustes del plan

Estado a 2026-10-24: **primer paso ejecutado** (cliente HTTP y ajustes del plan en `/settings`). Reanudado por petición del usuario tras la pausa; el resto de este registro (hasta «Ejecución») es el estado previo.

## Comprobaciones de la infra (hechas)

- API desplegada: `https://rgb-api-368607571687.us-central1.run.app`.
- Primera comprobación: **403** en todas las rutas (el servicio no era público). El usuario añadió el permiso de invocación pública (`allUsers` con `roles/run.invoker`).
- Segunda comprobación: `GET /api/health` 200 `{"status":"ok"}`; `GET /api/settings/plan` 200 (seis plantillas y factores 0,8 / 1,0 / 1,3); `GET /api/plan?project_type=industrial&scale=large` 200 (3-3-5-7-10-52-5, total 85, coincide con el PRD); `POST /api/projects/NOPE/promote` 404 con `{"code":"project_not_found","message":"No existe el proyecto NOPE."}`.
- CORS: al principio el preflight devolvía 400 y no había `access-control-allow-origin`. Tras el cambio de `CORS_ORIGINS` por el usuario, el preflight `PUT` devuelve 200 con `access-control-allow-origin` y `allow-headers: content-type` para `https://joe-s.vercel.app` y `http://localhost:3000`.
- El front en producción responde con las URLs en inglés (`https://joe-s.vercel.app/projects` 200).

## Hallazgos que condicionan el alcance

- La API de `main` solo expone promoción (`POST /api/projects/{code}/promote|hold|do-not-pursue`), `GET /api/plan` y los ajustes del plan. **No hay lecturas** de proyectos, entregables, tiempos, datos técnicos ni relieve, y los `PRY-EJ-00N` no están sembrados en la base. Por eso `lib/projects.ts`, `lib/timing.ts`, `lib/technical-data.ts` y `lib/relief.ts` siguen con datos de ejemplo.
- El front tampoco tenía botones de promoción ni pantalla de ajustes (`/settings` era un estado vacío).
- La API no tiene autenticación (contexto ficticio de desarrollo, rol socio) y cada `PUT` queda en la auditoría: las pruebas contra Cloud Run son solo de lectura.
- Para que el front desplegado llame a la API hay que fijar `NEXT_PUBLIC_API_URL` en Vercel (se incrusta en el build) y redesplegar. No hay MCP ni CLI de Vercel en la sesión: lo hace el usuario a mano, cuando se mergee el PR.

## Hecho

1. Plan escrito: [plan.md](plan.md) (cliente HTTP `lib/api.ts`, `lib/plan-settings.ts`, pantalla `/settings`).
2. Rama `feat/connect-api-settings` con el commit del plan (`6eb0d02`), sin push.
3. Escritor de tests lanzado (Sonnet) y detenido a la mitad.

## Estado del Escritor de tests (parado)

Escribió tres archivos de tests, sin revisar ni ejecutar, que no están en el repo (se guardaron fuera del árbol para no mezclarlos con este PR de documentación):

| Archivo | Líneas |
| --- | --- |
| `frontend/__tests__/lib/api.test.ts` | 155 |
| `frontend/__tests__/lib/plan-settings.test.ts` | 144 |
| `frontend/__tests__/app/settings.test.tsx` | 19 |

Faltaron `frontend/__tests__/components/settings/PlanSettingsEditor.test.tsx` y el «Contrato asumido» (firmas exactas que el Desarrollador debe respetar). Al reanudar hay que **revisarlos o rehacerlos**, completar el del editor y fijar el contrato antes de pasar al Desarrollador. Copia de los tres parciales: stash `stash@{0}` de la rama `feat/connect-api-settings` en el clon local.

## Pendiente (en orden)

1. Terminar los tests en rojo (Escritor).
2. Desarrollador → Tester (navegador real; API local para escribir, Cloud Run solo para leer; pantallazos claro/oscuro) → Juez (Opus).
3. PR con pantallazos y monitor cada 30 s; el usuario lo revisa.
4. Fijar `NEXT_PUBLIC_API_URL` en Vercel (usuario) y redesplegar.
5. Siguiente PR: botones de promoción (Promover, Retener, No perseguir) cuando la API pueda devolver proyectos reales.

## Ejecución (2026-10-24)

- `NEXT_PUBLIC_API_URL` fijada en Vercel por el MCP (proyecto `joe-s`, producción y preview, valor de Cloud Run). Falta un redeploy: se aplica con el del PR.
- Escritor de tests: rehizo los tres parciales, escribió los del editor y `contract.md`. Cambio justificado en `pages.test.tsx` (`/settings` ya no es un estado vacío).
- Desarrollador: `lib/api.ts`, `lib/plan-settings.ts`, `components/settings/PlanSettingsEditor.tsx`, página `/settings` y `docs/despliegue.md`.
- Tester (1.ª pasada), con el build real y la API local: halló valores que el cliente dejaba pasar y la API rechazaba con 500 (sin CORS, la interfaz decía «No se pudo conectar»), foco perdido tras guardar, mensaje de éxito que no se limpiaba y total sin sentido con valores inválidos. Corregido con topes en el cliente (1–520 semanas; factor 0,1–10), foco devuelto al campo, `aria-live` que se vacía al editar y «Total: —».
- Correcciones de tests justificadas: `0.01` pasó de aceptado a rechazado (mínimo 0,1) y un total esperado de 521 era 553 (3+3+5+7+10+520+5).
- Tester (2.ª pasada): correcciones verificadas; 15 pantallazos regenerados con la base limpia. Cloud Run, solo lectura: una carga de `/settings` desde `http://localhost:3000` hace únicamente `GET /api/settings/plan` → 200 con `access-control-allow-origin: http://localhost:3000`; ningún `PUT` ni `POST`.
- Juez (1.ª vez): **rechazado** por el foco perdido tras un error del servidor (422, 500 o red). Corregido (`restoreFocus` en el `catch`, 3 tests). Prettier no aplica (el repo no lo usa).
- Estado final: 957 tests, lint, typecheck y build en verde.

## Observaciones del entorno local

- `dev.sh` no siembra el estudio ficticio de desarrollo (`00000000-0000-0000-0000-00000000e001`); sin él todo `PUT` falla por la clave foránea. Hay que insertarlo a mano.
- `audit_events` es de solo inserción: las pruebas dejan filas; se limpian con `docker compose down -v`.

## Seguimientos

- El aviso de validación persiste al volver al valor guardado (solo se limpia al guardar bien).
- Una respuesta 200 con cuerpo mal formado deja «Cargando…» sin «Reintentar»: validar la forma en `fetchPlanSettings` y lanzar `ApiError(…, "unexpected_error")`.
- Backend: alinear topes (520 semanas, factor ≥ 0,1) y mensajes con el front, y devolver 422 en vez de 500 cuando un valor no cabe en la base.
- Etiquetas de dos líneas desalinean los campos de la fila.
- `UNEXPECTED_MESSAGE` duplicado en `lib/api.ts` y en el editor.
- Scroll horizontal a 360 px por las migas del layout (toda la plataforma).

## Pantallazos

Están en [screenshots/](screenshots/), con datos ficticios, claro y oscuro: `settings-loaded`, `settings-saved-success`, `settings-keyboard-focus`, `settings-client-validation-error`, `settings-server-422-error` (respuesta simulada con Playwright), `settings-api-down`, `settings-narrow-800px` y `settings-loaded-cloud-run-readonly-light`.
