# RGB-5 · implementation_log

Rama: `feat/RGB-5-auditoria`, apilada sobre `feat/RGB-3-multiestudio` (PR #11 abierto al empezar). TDD: tests en rojo por módulos inexistentes, implementación mínima, verde.

## Qué se hizo

- Migración `003_auditoria.sql`: `eventos_auditoria` con estudio, usuario, entidad, id de entidad, acción, versión, valor anterior y nuevo (jsonb), resultado (`ok` o `rechazado`) y fecha; protegida con la plantilla de RGB-3.
- Dominio: `EventoDeAuditoria` (valida campos obligatorios y versión ≥ 1) y `Resultado`; puerto `RegistroDeAuditoria`.
- Aplicación: `audit()` construye el evento desde el `ContextoDeSolicitud`.
- Infraestructura: `PostgresRegistroDeAuditoria` escribe con la conexión de la transacción de negocio.

## Decisiones

- **Dos barreras contra la alteración:** `rgb_app` solo tiene `SELECT` e `INSERT` (se revocan `UPDATE`, `DELETE` y `TRUNCATE`), y un disparador a nivel de sentencia rechaza `UPDATE`, `DELETE` y `TRUNCATE` incluso al propietario. A nivel de sentencia para que actúe aunque la RLS deje cero filas visibles.
- **La fecha la fija la base** (`now()`), no el servicio, para que no se pueda falsear desde la aplicación.
- **Rechazos auditables:** `resultado = rechazado` permite registrar intentos de promoción fallidos.
- **Límite conocido:** un superusuario puede desactivar el disparador. Es el límite de cualquier registro dentro de la misma base; no hay protección frente a quien administra Postgres.

## Verificación

- pytest 61 en verde; ruff limpio.
- Mutación: sin el `REVOKE` fallan 2 tests y sin el disparador fallan 3, así que cada barrera está cubierta.
