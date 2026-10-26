# RGB-4 · Registro de implementación

## 2026-10-26 · Tramo 1: dominio, tabla y gestión de equipo (sin cambiar comportamiento existente)

TDD: cada pieza empezó con su test en rojo.

- **Dominio `access`** (`backend/app/access/domain/`): `Action`, `ProjectRole`, `PersonActor`/`AiActor`, `ProjectResource`/`StudyResource` y `can(actor, action, resource) -> Decision(allowed, who)`. La matriz de promoción del PRD está en una sola tabla y se prueba fase a fase (0 a 7) y rol a rol; `AiActor` solo puede `READ` y un test recorre **todas** las acciones del enum. 111 tests puros.
- **Migración `011_project_members.sql`**: `project_members` con claves foráneas compuestas (`study_id`, `project_id`) y (`study_id`, `member_id`), de modo que una asignación no puede cruzar estudios ni siquiera por SQL directo; `UNIQUE (project_id, member_id, role)`, `CHECK` de las 7 funciones, RLS con `protect_study_table`, sin `UPDATE` para `rgb_app`. Añade `UNIQUE (study_id, id)` a `study_members` para poder referenciarla. 12 tests con Postgres real.
- **`ManageProjectMembers`** (asignar, quitar, listar) con auditoría de altas, bajas y rechazos. Reglas: lo gestiona socio, director o el director de proyecto **de ese proyecto**; las tres funciones de firmante habilitado, dirección facultativa y sponsor solo las da o quita un socio o director, y la persona debe tener la cualificación de estudio correspondiente y estar activa. 24 tests con `create_autospec`.
- **Rutas** `GET/POST /api/projects/{code}/members` y `DELETE /api/projects/{code}/members/{id}` con `{detail:{code,message}}`: 403, 404, 409, 422. 17 tests.
- Entorno local: `.venv-back` creado con `requirements-dev.txt`; integración contra el Postgres de desarrollo (`DATABASE_URL=postgresql://rgb:rgb@localhost:54329/rgb`).

Estado: 1500 → 1626 tests unitarios y de rutas; ruff limpio. Ningún caso de uso existente usa todavía `can`.

## 2026-10-26 · Tramo 2: los casos de uso consultan `can`

- **Decisión del usuario:** las fases 2 y 3 las promueve solo el director de proyecto de ese proyecto.
- `PromotionService` y `PauseService` reciben un `ProjectRoleReader` y preguntan a `can`; `StartProject`, `UpdateProjectSheet`, `PromoteProjectSheet` y `GetProjectSheet` también (fases 0 y 1, por rol de estudio, mismo resultado que antes). Se retiran `lifecycle/domain/authority.py`, su test y `can_manage_pauses` (la matriz y las reglas de pausa están ahora en los tests de `access`, que cubren lo mismo y más).
- **Tests que cambian y por qué:** los de promoción y pausas en fases 2 o más ya no dan la autoridad por el rol de estudio sino por la función en el proyecto, así que parten de un lector de funciones simulado (por defecto, director de proyecto) y los de rechazo lo vacían. Se añaden: el director de proyecto de otro proyecto no promueve ni pausa, socio y director no heredan fases 2 a 7, y socio promueve 0 y 1 sin función. `test_mfa` usa `can` para comprobar que administración no promueve en ninguna fase.
- **`AUTH_MODE=dev`:** `DevProjectRoles(context)` deduce las funciones del rol y las cualificaciones del usuario ficticio. Una primera versión que concedía todas las funciones rompía un test existente (un `architect` de desarrollo podía pausar); se corrigió para mantener la semántica anterior.
- **Test de arquitectura:** los casos de uso de `lifecycle`, `opportunity`, `timing` y `portfolio` no pueden importar `Role` ni `Qualification`. Se comprobó que falla con una infracción de prueba.
- **De punta a punta con Postgres real** (`test_project_roles_end_to_end.py`): sin la función se rechaza y se audita; asignada, promueve solo ese proyecto; quitada o con la persona revocada, pierde la autoridad; el socio no hereda; altas y bajas auditadas.
- Suite completa con Postgres: 2020 tests en verde (baja respecto a 2025 porque se retiraron `test_authority.py` y `TestAuthority` de pausas, cuya cobertura pasó a `tests/access`). Sin veredicto de Juez independiente.

## 2026-10-26 · Tramo 3 (RGB-4b): scoring, ajustes y alta consultan la política

- `access/application/guard.py: require(context, action)` pregunta a `can` y lanza `NotPermitted` (código `no_authority`, mensaje en español propio de cada acción). Se llama **lo primero** en `ScoringService.score`, `ScoringSettingsService.update`, `PlanSettingsService.update_template`/`update_scale_factor` y `CreateOpportunity.execute`: el 403 gana al 404 y al 422, y no se guarda nada.
- Un único manejador en `create_app` convierte `NotPermitted` en `403 {detail:{code,message}}`.
- Quién puede: puntuar y cambiar ajustes, **socio y director**; dar de alta una oportunidad, **socio, director y director de proyecto**. Leer sigue abierto a todo miembro.
- Tests: `test_require.py` (matriz de roles), `test_permissions.py` (cada servicio, con puertos simulados: nada se lee ni se guarda), `test_permission_routes.py` (403 antes que 422 en las cinco rutas; una primera versión enviaba cuerpos mal formados y daba 422 por el esquema, se corrigió el test). Los tests existentes usaban socio y no cambian.
- No se audita el rechazo (son errores lanzados y la transacción se deshace, como el resto de errores de estos servicios); queda como mejora si se quiere traza de intentos.

## Fuera de este PR (seguimiento)

Hecho en el tramo 3 (RGB-4b). Quedan `APPROVE_DELIVERABLE` y `MANAGE_STUDY_MEMBERS`, que usarán RGB-36 y la gestión de miembros.
