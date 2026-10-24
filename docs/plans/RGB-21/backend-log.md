# RGB-21 · Registro del frente back

## Qué se hizo

- `backend/migrations/007_pauses.sql`: tabla `pauses` (fase 1 a 7, motivo con CHECK de los 4 valores, `started_on`, `expected_resumption >= started_on`, `resumed_on >= started_on`, `opened_by`, `closed_by`, `created_at`), FK compuesta `(study_id, project_id)`, índice único parcial `pauses_one_open_per_project` (`WHERE resumed_on IS NULL`) y `protect_study_table('pauses')`. CHECK adicional: `resumed_on` y `closed_by` van juntos (ambos nulos o ambos informados). No toca tablas existentes.
- Contexto `timing` (el del reloj, para reutilizar `PauseReason`):
  - dominio: `Pause`, `NewPause`, `PausableProject`, `PauseRequest.from_input(data, today)` (primer error en el orden `reason`, `expected_resumption`), `can_manage_pauses` (project_director, director, partner), `days_past`, errores (`NotAllowed`, `AlreadyPaused`, `NotPaused`, `CannotPauseOpportunity`, `RequiredField`, `InvalidField`, `ProjectNotFound`) y el puerto `PauseRepository`. Sin `date.today()`.
  - aplicación: `PauseService` (`pause`, `resume`, `history`), con reloj inyectado. Devuelve `PauseResult(view | error)` en lugar de lanzar, para que la transacción haga commit y el rechazo por permiso quede en la auditoría.
  - infraestructura: `PostgresPauses`.
- Rutas (`api/pause_routes.py`): `POST /api/projects/{code}/pause` (201), `POST .../resume` (200), `GET .../pauses`. Composición en `pause_unit_of_work`.
- Cartera: `ProjectRecord` gana `pause_reason` y `pause_expected_resumption` (LEFT JOIN a la pausa abierta), `PortfolioEntry.pause` y el campo aditivo `pause` en `GET /api/portfolio`. `overdue` se calcula con `days_past` del dominio de `timing`.

## Decisiones

- Contexto `timing` y no `lifecycle`: la pausa pertenece al reloj y reutiliza `PauseReason`; `lifecycle` no crece. `portfolio` importa solo la función pura `days_past` de `timing.domain`.
- Orden al pausar exactamente el del contrato: proyecto (404), permiso (403, auditado), fase 0 (422), campos (422), ya en pausa (409). Reanudar: proyecto (404), permiso (403, auditado), sin pausa abierta (409).
- Auditoría: entidad `project`, `entity_id` = código, acciones `pause_project` y `resume_project`; el rechazo por permiso se guarda con `outcome = rejected` y `new_value = {"error": "not_allowed"}`. Los 409 y 422 no se auditan (no cambian nada).
- «Ya en pausa» (409) depende de la fila abierta en `pauses`, no de `projects.paused`. Si el flag está activo sin fila (dato heredado), se puede pausar (crea la fila y deja el flag) pero no reanudar (`not_paused`): así no hay estado sin salida y no se inventa una pausa.
- El proyecto se bloquea con `SELECT ... FOR UPDATE` al pausar o reanudar: dos peticiones simultáneas se serializan y la segunda recibe `already_paused`; el índice único parcial es la segunda barrera.
- `set_paused` actualiza también `projects.updated_at` (cuenta como actividad en «días desde la última actualización»).
- Fechas en UTC: «hoy» es la fecha UTC del reloj inyectado; la fecha prevista puede ser hoy. Fechas solo `aaaa-mm-dd` estricto.
- Mensajes `invalid_field` (el contrato solo fija tres): «no es un motivo admitido», «debe ser una fecha con formato aaaa-mm-dd», «no es una fecha existente», «no puede ser anterior a hoy». Motivo con espacios alrededor se recorta; en mayúsculas no es válido.
- Tests existentes modificados, con justificación: `test_opportunity_routes.py` espera ahora `"pause": null` en cada proyecto de la cartera (campo aditivo del contrato); `test_queries.py` construye `ProjectRecord` con los dos campos nuevos.

## Desviaciones del contrato

Ninguna.

## Verificación

- TDD en orden rojo, verde: dominio puro (`tests/timing/domain`), casos de uso con `create_autospec` (`tests/timing/application`), Postgres real (`tests/timing/infrastructure`: aislamiento estudio A/B, índice único parcial también en concurrencia con dos hilos, restricciones CHECK y FK, auditoría, rollback), rutas con `TestClient` simulado y contra Postgres real (`tests/api/test_pause_routes*.py`), cartera (`tests/portfolio`).
- `ruff check backend` limpio; `pytest backend` en verde (658 tests).
- API local (uvicorn + `back-db-1`, tres procesos con `DEV_ROLE` distinto): alta de oportunidad, pausar la fase 0 (422 `cannot_pause_opportunity`), promoción a la fase 1, 422 de motivo y de fecha, pausa 201, segunda pausa 409, `GET pauses`, cartera con `status: paused` y `pause`, 403 con rol `architect` (auditado), 404, preflight CORS y respuesta con `Access-Control-Allow-Origin: http://localhost:3000`, reanudar 200, reanudar de nuevo 409, cartera y historial tras reanudar.
- No hay ruta de API para completar y aprobar el entregable de salida de la fase 0, así que en la prueba local se insertó esa fila con SQL (propietario de la base local) antes de promover por la API. La promoción en fase 0 exige rol partner o director (`partner_director`); por eso se usó un proceso con el rol por defecto (`partner`) para promover y otro con `project_director` para pausar.
- Limpieza de la base local: se borraron proyectos, oportunidades, pausas, promociones y versiones congeladas de la prueba (desactivando y reactivando dentro de la misma transacción los triggers de solo inserción de `promotions` y `frozen_versions`, solo en la base local). `audit_events` no se tocó.
- Nada se escribió contra Cloud Run.

## Seguimientos

- El aviso diario al director de proyecto sigue fuera (no hay canal de avisos ni planificador); la API expone `overdue` y `days_overdue`.
- La autoridad por rol real llega con RGB-2/RGB-4; hoy el rol viene del contexto de desarrollo.
