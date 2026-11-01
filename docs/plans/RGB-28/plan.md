# RGB-28: modelo de dato técnico (valor, origen, original, editado, verificado)

Notion: https://app.notion.com/p/3fd444f747b381c0bc5df26abb06a6c0 · Depende de RGB-3 (multiestudio con RLS, hecha). Usa RGB-24 (cliente del Catastro, hecho) y RGB-4 (permisos).

## Qué es
El backend de la pantalla de datos técnicos del Briefing (front RGB-29, que hoy usa datos de ejemplo). Cada dato guarda su valor, su origen, el valor original y si está verificado; todos son editables.

## Catálogo
Las 26 definiciones de `frontend/lib/technical-data.ts` (`DEFINITIONS`: id, grupo parcela / condiciones técnicas / planeamiento, tipo texto · número con unidad · lista con opciones, origen) son el contrato. El backend las replica en `technical_data/domain/catalog.py` y un JSON compartido (`backend/tests/technical_data/domain/catalog_cases.json`: ids, grupo, tipo, unidad, opciones) lo leen un test de back y un test de front, para que no se desvíen (mismo patrón que `cadastral_cases.json`).

## Dominio (`backend/app/technical_data/`, contexto nuevo)
- `TechnicalDatum`: `field_id`, `value`, `source` (`catastro`, `manual`, … el origen del catálogo), `original` (`None` = dato manual que nunca vino de una consulta), `verified`. Editado = `original is not None and value != original` (misma regla que el front).
- Operaciones puras: `edit(value)` (valida por tipo: texto no vacío y acotado; número con coma o punto decimal y rango razonable; lista: debe ser una de las opciones; conserva el original y deja `verified=False`), `restore()` (vuelve al original y deja `verified=False`; en manuales no hace nada), `verify()`, `verify_all()`.
- `refresh(queried: dict[field_id, value])` — «volver a consultar»: para cada campo que la consulta rellena: si el dato no está editado se sustituye por el nuevo valor y su `original` se actualiza (si el valor cambió, `verified` vuelve a falso); si está **editado**, se conserva el valor de la persona y verificado, y solo se actualiza el `original`; los datos **manuales** (planeamiento y cualquier campo que la consulta no devuelve) no se tocan jamás.
- Mapeo Catastro → catálogo: dirección, municipio, clase (UR→«Urbano», RU→«Rústico»), uso catastral (solo si coincide con una opción), año, superficie construida, superficie de parcela catastral, coordenadas. Un valor que no cabe en su campo (p. ej. un uso fuera de la lista) no se escribe y se informa como no mapeado.

## Aplicación y permisos
Casos de uso `GetTechnicalData`, `EditDatum`, `RestoreDatum`, `VerifyDatum`, `VerifyAll`, `RefreshTechnicalData` (este usa `GetCadastralProperty`). Editar, restaurar, verificar y volver a consultar exigen autoridad sobre el proyecto vía `can(...)` con `EDIT_DELIVERABLE` (la política decide; no se mira el rol en el caso de uso, hay un test de arquitectura que lo vigila); leer, cualquier persona del estudio. **Cada edición, restauración, verificación y consulta queda en auditoría** (quién, qué, antes y después); los rechazos por permiso también. Solo se puede editar mientras el proyecto está en la fase de Briefing (2) y los datos se congelan al promover (si la política/promoción actual lo permite sin tocar RGB-4; si no, queda anotado como seguimiento).

## Persistencia (migración 013, RLS con `protect_study_table`)
`technical_data(study_id, project_id, field_id, value, source, original, verified, updated_at, PK (project_id, field_id))` con clave foránea compuesta al proyecto del mismo estudio, e `technical_data_queries(project_id PK, cadastral_reference, queried_at)` para la fecha de la última consulta. Los datos sin consultar no existen como filas (se leen del catálogo con valor vacío).

## API
`GET /api/projects/{code}/technical-data` → `{cadastral_reference, queried_on, data: [{id, value, original, verified, edited, source}]}` completo según el catálogo; `PUT .../{field_id}` `{value}`; `POST .../{field_id}/restore`; `POST .../{field_id}/verify`; `POST .../verify-all`; `POST .../refresh` `{cadastral_reference}` (usa RGB-24; si el Catastro falla devuelve 503 y **no toca nada**). Errores `{detail:{code,message}}` en español: 404 proyecto o dato inexistente, 403 sin autoridad, 409 fase incorrecta, 422 valor inválido.

## Criterios de aceptación (Notion)
Cada edición y verificación queda en auditoría; volver a consultar no borra el planeamiento manual. Tests de dominio puros, casos de uso con puertos simulados, infraestructura con Postgres real (incluida la RLS), rutas y test de paridad del catálogo.

## Fuera de alcance
Conectar la pantalla del front (seguimiento: sustituir los datos de ejemplo de `lib/technical-data.ts` por el cliente), perímetro INSPIRE, altitud, tablas del CTE y capacidad edificable (RGB-25, 26, 27, 30).
