# RGB-3 · Modelo multiestudio con seguridad por fila

Tarea de Notion: https://app.notion.com/p/3fd444f747b381cf8ba9cc958ae67a84
Tipo: Datos · Épica E0 · P0 · Tamaño M. Depende de RGB-1 (hecha). Sin autenticación (RGB-2 queda fuera).

## Alcance

- Tabla `studies` y rol de base de datos `rgb_app` (sin login) con el que la API ejecuta cada petición. Los propietarios de tabla saltan la RLS, por eso se fuerza (`FORCE ROW LEVEL SECURITY`) y la API cambia a `rgb_app` con `SET LOCAL ROLE`.
- Plantilla `protect_study_table(table)`: activa y fuerza RLS, crea la política `study_isolation` sobre `study_id` y da permisos a `rgb_app`. Toda tabla de negocio nueva la invoca en su migración.
- Comprobación `tables_without_rls()`: lista las tablas del esquema sin RLS forzada o sin política. Un test la ejecuta sobre las migraciones reales y CI (pytest) falla si una tabla nueva no está protegida.
- Contexto de estudio por petición: `RequestContext` (dominio) y `study_transaction(...)` (infraestructura), que abre la transacción, cambia a `rgb_app` y fija `app.study_id` solo para esa transacción.
- Dependencia de FastAPI que entrega un contexto fijo y ficticio mientras no haya autenticación.

Falla cerrado: sin `app.study_id` fijado no se ve ni se escribe nada.

Fuera de alcance: tablas de negocio (RGB-8 en adelante), roles y permisos de usuario (RGB-4), autenticación (RGB-2), semillas (RGB-7).

## Archivos

```
backend/migrations/002_multistudy.sql
backend/app/study/domain/context.py        # ContextoDeSolicitud, Rol
backend/app/shared/db.py                      # transaccion_de_estudio
backend/app/api/dependencies.py               # contexto_de_solicitud (fijo de desarrollo)
backend/app/shared/config.py                  # dev_estudio_id, dev_usuario_id
backend/tests/conftest.py                     # fixture schema_url compartida
backend/tests/shared/test_rls.py              # aislamiento A/B (integración)
backend/tests/shared/test_rls_check.py        # tablas_sin_rls
backend/tests/shared/test_db.py               # transaccion_de_estudio
backend/tests/study/domain/test_context.py
backend/tests/api/test_dependencies.py
```

## Criterios de aceptación

- [ ] Un test demuestra que con el estudio A no se lee, inserta, actualiza ni borra nada del estudio B, ni con SQL directo.
- [ ] Sin estudio fijado no se ve nada.
- [ ] Una tabla con `study_id` sin política es detectada por `tables_without_rls()`; las migraciones reales no tienen ninguna.
- [ ] pytest y ruff en verde, CI en verde.
