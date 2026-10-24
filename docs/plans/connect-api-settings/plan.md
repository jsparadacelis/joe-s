# Conexión del front con la API · cliente HTTP y ajustes del plan

Tarea transversal (no tiene fila propia en Notion; la pantalla es la interfaz de RGB-15, que expone la API). Tipo: Frontend · primer paso de la conexión front–API.
Depende de: RGB-15 (hecha en `main`) e infra (API en Cloud Run, pública, con CORS para `https://joe-s.vercel.app` y `http://localhost:3000`).

## Contexto

La API de `main` solo expone: promoción (`POST /api/projects/{code}/promote|hold|do-not-pursue`), plan (`GET /api/plan`) y ajustes del plan (`GET /api/settings/plan`, `PUT /api/settings/plan/templates/{project_type}`, `PUT /api/settings/plan/scale-factors/{scale}`). No hay lecturas de proyectos, entregables, tiempos, datos técnicos ni relieve, así que esas capas de datos de ejemplo siguen como están (ver `docs/estado.md`). Esta tarea conecta lo único que se puede probar de punta a punta hoy: **los ajustes del plan** (plantillas de semanas por tipología y factores de escala), y deja el cliente HTTP listo para el resto.

Comprobado el 2026-10-24 contra `https://rgb-api-368607571687.us-central1.run.app`: `/api/health` 200, `/api/settings/plan` 200, `/api/plan` 200 (industrial grande = 3-3-5-7-10-52-5, total 85) y CORS correcto. Ojo: la API no tiene autenticación (contexto ficticio de desarrollo, socio) y cada `PUT` queda en el registro de auditoría: **las pruebas contra la API desplegada son solo de lectura**; las de escritura se hacen contra la API local.

## Alcance

1. **Cliente HTTP** `frontend/lib/api.ts`.
   - Base desde `process.env.NEXT_PUBLIC_API_URL` (por defecto `http://localhost:8000`), sin barra final.
   - `request<T>(path, init?)`: JSON de ida y vuelta; `204` devuelve `undefined`.
   - `ApiError { status, code, message }`: respuestas no 2xx con `{ detail: { code, message } }` conservan el `code` y el `message` (la API los escribe en español); otros cuerpos (FastAPI 422 de validación con `detail` en lista, HTML de un proxy, vacío) dan `code` `unexpected_error` y el mensaje «Ocurrió un error inesperado. Inténtalo de nuevo.»; fallo de red / CORS → `status 0`, `code` `network_error`, «No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.»
   - `fetch` inyectable para tests; sin dependencias nuevas.
2. **Ajustes del plan** `frontend/lib/plan-settings.ts`: tipos `ProjectType` (`single_family_house`, `rehabilitation`, `multi_family`, `facility`, `industrial`, `renovation_interiors`) y `Scale` (`small`, `medium`, `large`) con etiquetas en español (Vivienda unifamiliar, Rehabilitación, Plurifamiliar, Dotacional, Industrial, Reforma de interiores; Pequeña, Media, Grande), `PlanSettings { templates: Record<ProjectType, number[]>; scaleFactors: Record<Scale, number> }`, `fetchPlanSettings()`, `updateTemplate(type, weeks)`, `updateScaleFactor(scale, factor)` y validación de entrada en el cliente (`validateWeeks`: 7 enteros ≥ 1; `validateFactor`: número > 0 y ≤ 10), con los mismos mensajes que la API. El mapeo `scale_factors` → `scaleFactors` vive solo aquí.
3. **Pantalla `/settings`** (`app/settings/page.tsx`, servidor, con `PageHead`) + `components/settings/PlanSettingsEditor.tsx` (cliente, `fetcher`/`updater` inyectables):
   - Sección «Plantillas de semanas por tipología»: una fila por tipología con 7 campos numéricos (fases 1 a 7, con el nombre de la fase en la etiqueta accesible), total de semanas calculado en vivo en pantalla y botón «Guardar» por fila, deshabilitado mientras no haya cambios o mientras se guarda.
   - Sección «Factores de escala»: un campo por escala (Pequeña, Media, Grande) y «Guardar» por factor.
   - Estados: «Cargando ajustes del plan…»; error de carga con el mensaje y botón «Reintentar»; éxito «Plantilla de {tipología} guardada.» / «Factor de escala {escala} guardado.» en región `aria-live`; error de guardado con el mensaje de la API (422) junto a la fila/campo, `aria-invalid` y `aria-describedby`, conservando lo escrito; entrada inválida en el cliente muestra el aviso y **no** llama a la API.
   - Tras guardar bien, el valor «guardado» se actualiza (el botón vuelve a quedar deshabilitado); si falla, la fila sigue con cambios.
   - Texto de ayuda: «Los cambios se aplican a los planes que se generen a partir de ahora y quedan en el registro de auditoría.»
4. **Configuración**: `frontend/.env.example` ya define `NEXT_PUBLIC_API_URL`; se documenta en `docs/despliegue.md` que debe fijarse también en Vercel (se incrusta en el build, hay que redesplegar al cambiarla).

Fuera de alcance: botones de promoción (siguiente PR), vista previa del plan (`GET /api/plan`), lecturas de proyectos/tiempos/datos técnicos/relieve (no existen en la API), autenticación (RGB-2), edición concurrente (último en guardar gana, como la API).

## Criterios de aceptación

- [ ] Con la API local, `/settings` carga las seis plantillas y los tres factores reales, edita y guarda cada uno, y al recargar la página persisten.
- [ ] Entrada inválida (no entera, < 1, factor ≤ 0 o > 10, campo vacío): aviso y sin petición. Rechazo 422 del servidor: se muestra su mensaje en español y se conserva lo escrito.
- [ ] API caída o CORS: mensaje claro «No se pudo conectar con el servidor…» con «Reintentar», sin romper la página.
- [ ] Accesible con teclado; etiquetas asociadas; estados y errores en texto (no solo color); `aria-live` para resultados; todo en español; solo tokens; sin datos reales.
- [ ] Código, comentarios, nombres de tests y datos de prueba en inglés.
- [ ] `lint`, `typecheck`, `test` y `build` en verde en `frontend/`.
- [ ] Verificación real: `/settings` en el build real contra la API local (escritura) y contra la API de Cloud Run **solo lectura** (carga correcta, CORS).
- [ ] Pantallazos en `docs/plans/connect-api-settings/screenshots/` (cargado, guardado con éxito, error de validación del servidor, API caída, claro y oscuro) enlazados en el PR.

## Flujo (4 subagentes)

Escritor de tests (Sonnet, rojo) → Desarrollador (Sonnet, sin tocar esos tests) → Tester (Sonnet, navegador real, API local para escribir y Cloud Run solo para leer, pantallazos) → Juez (Opus). Con veredicto aprobado se abre el PR con pantallazos, se monta el monitor del PR y se actualizan `docs/estado.md`, el log y la memoria.
