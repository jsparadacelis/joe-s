# RGB-3 · implementation_log

Rama: `feat/RGB-3-multiestudio`. TDD: tests en rojo por módulos inexistentes, implementación mínima, verde.

## Qué se hizo

- Migración `002_multiestudio.sql`: rol `rgb_app` (sin login), `proteger_tabla_de_estudio(tabla)`, `tablas_sin_rls()` y tabla `estudios` con su propia política.
- `ContextoDeSolicitud` y `Rol` (los seis roles del PRD) en `backend/app/estudio/domain`.
- `transaccion_de_estudio` en `backend/app/shared/db.py`: `SET LOCAL ROLE rgb_app` y `set_config('app.estudio_id', ..., true)`; confirma o deshace.
- Dependencia `contexto_de_solicitud` con un contexto fijo y ficticio (`Settings.dev_estudio_id`).
- Fixture `schema_url` movida a `conftest.py` y compartida.

## Decisiones

- **La RLS solo protege si la API no consulta como propietario.** Por eso existe `rgb_app` y cada petición cambia a él. Las tablas además usan `FORCE ROW LEVEL SECURITY`.
- **Falla cerrado:** sin `app.estudio_id` la política compara contra `NULL` y no devuelve ni acepta filas (test incluido).
- **`GRANT rgb_app TO current_user`** en la migración: en Supabase el usuario no es superusuario y necesita poder hacer `SET ROLE`. No verificado contra Supabase real.
- **`Rol` se define aquí** porque `ContextoDeSolicitud` lo necesita; los permisos por rol son de RGB-4.
- `Settings` no se usa como dependencia directa de FastAPI (sus parámetros `_env_file` rompen la firma); se usa `get_settings()`.

## Verificación

- pytest 32 en verde; ruff limpio.
- Mutación: con la política desactivada en la plantilla fallan 7 tests del aislamiento, así que los tests detectan una RLS rota.

## No verificado

- Comportamiento contra Supabase real (roles y grants), a validar cuando exista el proyecto.
