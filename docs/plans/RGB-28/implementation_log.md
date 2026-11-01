# RGB-28: registro de implementación (backend)

Rama `rgb-28/technical-data-model`. TDD: cada pieza nace de tests escritos antes (rojo por módulo inexistente, luego verde). Sin push ni PR.

## Qué se hizo

1. **Dominio** `backend/app/technical_data/domain/`: `catalog.py` (los 26 datos de `DEFINITIONS`, mismos ids camelCase del front, grupo, tipo, unidad, opciones, orden y un `Source` por dato), `values.py` (validación por tipo), `datum.py` (`TechnicalDatum`: `edit`, `restore`, `verify`, `refreshed`; `edited = original is not None and value != original`), `technical_data.py` (hoja completa del catálogo: `edit/restore/verify/verify_all/refresh/changes_since`), `errors.py`, `ports.py`.
2. **Paridad del catálogo**: `backend/tests/technical_data/domain/catalog_cases.json` (generado una vez desde `DEFINITIONS`, con id, grupo, tipo, unidad, opciones y orden por posición), leído por `test_catalog.py` y por el test nuevo `frontend/__tests__/lib/technical-data-catalog-parity.test.ts`. El front no se ha tocado: coincide con el plan.
3. **Aplicación** `technical_data/application/`: `GetTechnicalData`, `EditDatum`, `RestoreDatum`, `VerifyDatum`, `VerifyAll`, `RefreshTechnicalData`, más `common.py` (`SheetWriter`: proyecto → autoridad → fase → auditoría de cambios y de rechazos), `cadastral_mapping.py` (Catastro → catálogo) y `use_cases.py`.
4. **Infraestructura**: migración `013_technical_data.sql` (tablas `technical_data` y `technical_data_queries`, claves compuestas `(study_id, project_id)` al proyecto, `protect_study_table`, `REVOKE DELETE, TRUNCATE`), adaptadores `PostgresTechnicalData` y `PostgresTechnicalProjects`.
5. **API**: `api/technical_data_routes.py` (registrado en `main.py`), cableado en `dependencies.py` (`technical_data_unit_of_work` y `refresh_technical_data_unit_of_work`).
6. **Arquitectura**: `technical_data` añadido a `POLICY_CLIENTS` (no se decide por rol en la aplicación) y un test que vigila el dominio puro y que los adaptadores solo los importa `api/dependencies.py`.

## Decisiones

- **Permisos**: se usa `decide(..., Action.EDIT_DELIVERABLE, ..., phase=2)` tal cual; no hizo falta tocar `access`. Hoy en fase 2 solo tiene autoridad el *director de proyecto* (función en el proyecto). Un socio o director del estudio recibe 403 al editar; en `AUTH_MODE=dev` con `DEV_ROLE=partner` (el predeterminado) la edición da 403 (hay que usar `DEV_ROLE=project_director`). Si se quiere que dirección también edite, es un cambio de política (RGB-4), no de este contexto.
- **Orden de comprobaciones** en las escrituras: proyecto (404) → autoridad evaluada como en fase 2 (403) → fase (409) → dato (404) → valor (422). Así el 403 no depende de la fase. Todo rechazo posterior al 404 de proyecto queda en auditoría con `outcome=rejected`.
- **Volver a consultar** en tres pasos para no retener conexión durante la llamada lenta al Catastro: transacción corta (autoridad y fase, sin llamar al Catastro si se rechaza), `GetCadastralProperty` sin transacción, transacción de escritura que vuelve a comprobar la fase y bloquea el proyecto. Si el Catastro falla se propaga (422/404/503) y no se escribe nada ni se audita.
- **Origen (`source`)**: slug del catálogo (`catastro`, `inspire`, `open_meteo`, `calculated`, `cte`, `ncse`, `pvgis`, `manual`). Un dato sin consultar aparece con el origen esperado y valor vacío; si una persona lo escribe a mano pasa a `manual` con `original = null`; al consultar se sustituye (como en `requery` del front) y vuelve al origen del catálogo.
- **Valores**: siempre texto, número con coma decimal (se admite punto y se guarda con coma). Rangos: 0–10.000.000 por defecto, 0–100 para `%`, altitud −500–9000, año entero 1000–2100. Texto no vacío, hasta 200 caracteres. Lista: una de las opciones exactas.
- **`restore`** de un dato no editado (manuales incluidos) no hace nada, tampoco quita la verificación (el plan decía «deja `verified=false`»; solo tiene sentido si hay algo que restaurar).
- **`verify`** de un dato vacío da 422 `empty_datum`; `verify_all` verifica solo los que tienen valor (los vacíos se quedan pendientes).
- **Mapeo Catastro**: municipio como «MUNICIPIO (PROVINCIA)» (formato de los datos de ejemplo del front); coordenadas «38,5000 N · 3,5000 W» con 4 decimales; clase UR/RU a Urbano/Rústico; uso solo si coincide (sin distinguir mayúsculas) con una opción. `unmapped` (en la respuesta de `refresh`) lista los campos del Catastro sin valor aplicable, ya sea porque no lo dio o porque no cabe.
- La auditoría guarda: edición/restauración `{value, verified}` antes y después; verificación `{verified}`; `verify_all` los ids afectados; `refresh` los datos cambiados antes y después, la referencia y los `unmapped`. Entidades `technical_datum` (id `CODIGO/campo`) y `technical_data` (id `CODIGO`).

## API

`GET /api/projects/{code}/technical-data`, `PUT .../{field_id}` `{value}`, `POST .../{field_id}/restore`, `POST .../{field_id}/verify`, `POST .../verify-all`, `POST .../refresh` `{cadastral_reference}`. PUT/restore/verify devuelven el dato `{id, value, original, verified, edited, source}`; GET y verify-all la hoja `{cadastral_reference, queried_on, data}`; refresh la hoja más `unmapped`. Errores `{detail:{code,message}}`: 404 `project_not_found` / `unknown_datum`, 403 `no_authority` (con `allowed`), 409 `technical_data_not_editable`, 422 `invalid_datum_value` / `empty_datum` / `invalid_request`; refresh añade los del Catastro (422/404/503).

## Resultados

- `pytest backend` con Postgres real: 2418 passed (6 min). Tests nuevos: 230 casos en `backend/tests/technical_data/` y `backend/tests/api/test_technical_data_routes*.py` (dominio, aplicación con `create_autospec`, Postgres real, rutas con dobles y con Postgres), más el test de arquitectura y 27 casos de paridad en el front.
- `ruff check backend` y `ruff format backend`: limpios. Front: `lint` (3 avisos que ya existían), `typecheck` y `test` (2197) en verde, con el test de paridad (27 casos).

## Seguimientos

- Conectar la pantalla RGB-29 al cliente HTTP (sustituir los datos de ejemplo de `lib/technical-data.ts`).
- Congelado: al promover de la fase 2 a la 3 las escrituras ya devuelven 409, pero la promoción no guarda una versión congelada de los datos técnicos; hacerlo toca el ciclo de vida (RGB-9/RGB-12) y queda fuera.
- Decidir con RGB-4 si dirección (socio/director) debe poder editar en fase 2.
