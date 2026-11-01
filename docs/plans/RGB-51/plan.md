# RGB-51: conectar la pantalla de datos técnicos a la API

Notion: https://app.notion.com/p/40b444f747b381e88f23f26f46daed55 · Depende de RGB-24 (Catastro, hecha), RGB-28 (modelo de dato técnico, hecha) y RGB-29 (pantalla, hecha con datos de ejemplo).

## Objetivo
Que el panel de datos técnicos de la fase 2 (Briefing) lea y guarde en el servidor en vez de en memoria: editar, restaurar, verificar, «Verificar todo» y «Obtener datos técnicos» / volver a consultar el Catastro, con los errores reales del servidor. El contrato público de `lib/technical-data.ts` se diseñó para este cambio («la zona SAMPLE DATA se sustituye por el cliente de la API sin tocar los componentes»): cualquier cambio de firma debe justificarse.

## Contrato (back existente, RGB-28 y RGB-24)
Léelo en `backend/app/api/technical_data_routes.py` y `docs/plans/RGB-28/plan.md`:
- `GET /api/projects/{code}/technical-data` → catálogo completo `{cadastral_reference, queried_on, data:[{id,value,original,verified,edited,source}]}`.
- `PUT .../{field_id}` `{value}`, `POST .../{field_id}/restore`, `POST .../{field_id}/verify`, `POST .../verify-all`, `POST .../refresh` `{cadastral_reference}` (devuelve además `unmapped`).
- Errores `{detail:{code,message}}` en español: 403 (solo el director de proyecto del proyecto), 409 (fuera de la fase 2), 422 (valor inválido), 404, 503 `cadastre_unavailable` («Introduce los datos a mano»; no se toca nada). El servidor decide permisos: el front muestra el mensaje.

## Cambios en el front
- `lib/technical-data.ts`: mantiene `DEFINITIONS`, tipos y funciones puras; las funciones de acceso a datos pasan al cliente de la API (`createApiClient`, mismo patrón que `lib/members.ts` / `lib/sheet.ts`) y el mapeo de snake_case de la API al modelo del front se prueba.
- Proyectos de ejemplo `PRY-EJ-00N` siguen locales (como en el resto de pantallas: su código no existe en el servidor); los proyectos reales usan la API. Los datos de ejemplo se conservan solo para esos.
- `components/project/technical-data/*` (`TechnicalDataEditor`, `DatumRow`, `GroupPanel`, `VerificationSummary`, `CapacityPanel`): cada operación llama a la API y pinta el resultado que devuelve el servidor (nada de estado optimista que el servidor pueda contradecir); estados «guardando» por dato, errores accesibles junto al dato o en un aviso general con foco gestionado; el 503 al consultar el Catastro muestra la ruta manual existente; el 403 y el 409 dejan la pantalla en solo lectura con el mensaje del servidor; «Obtener datos técnicos» exige la referencia catastral válida (RGB-18) antes de llamar.
- Mensajes nuevos de la referencia catastral de RGB-18 (la pantalla aún muestra uno genérico): mostrar los del servidor/`validateCadastralReference`.

## Fuera de alcance
Altitud, pendiente, polígono INSPIRE, tablas del CTE y capacidad edificable reales (RGB-25, 26, 27, 30): esos datos siguen vacíos o manuales hasta que existan; la pantalla debe tratar bien un dato sin valor. Congelar los datos al promover (seguimiento de RGB-28).

## Flujo
Escritor de tests → Desarrollador → Tester (build real + API real con Postgres local, rol director de proyecto asignado y rol sin autoridad; el Catastro simulado, **no** llamadas reales en pruebas; pantallazos claro y oscuro en `docs/plans/RGB-51/screenshots/`) → Juez → PR → merge → despliegue.
