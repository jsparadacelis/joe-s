# RGB-4 · Roles de estudio y de proyecto con permisos

Tarea de back (P0, M, E0). Depende de RGB-2 y RGB-3; bloquea RGB-9 (ya hecha con una versión provisional de la autoridad), RGB-13 y RGB-21 en sus permisos reales. Flujo de back: contrato primero, TDD (rojo → verde → refactor), Juez, PR.

Fuente: página RGB-4 del Backlog y tabla «Entregable de salida por fase» del PRD.

## Criterios de aceptación

- [ ] La matriz «quién promueve» del PRD está codificada y probada fase a fase.
- [ ] La IA no tiene ningún permiso de cambio de estado.

## Situación de partida

- La autoridad de promoción vive en `lifecycle/domain/authority.py` (`has_authority`, `who_can`) y mira **solo el rol de estudio** y las cualificaciones del `RequestContext`. Un director de proyecto de cualquier proyecto puede promover cualquier proyecto en las fases 2 y 3.
- Las pausas tienen su propia regla (`timing/domain/pause.py: can_manage_pauses`) y la gestión de miembros otra (`study/application/manage_members.py`, `invitation_policy.py`). Cada caso de uso decide por su cuenta.
- No existe el rol **por proyecto**: no hay tabla ni puerto. Las cualificaciones (`licensed_signatory`, `site_management`, `sponsor`) son atributos de la persona en todo el estudio.

## Diseño

1. **Función central** `can(actor, action, resource) -> Decision` en un contexto nuevo `access` (dominio puro). `Decision` lleva `allowed` y, si se rechaza, `who` (etiquetas de quién sí puede) para que los errores 403 sigan diciendo «Pueden hacerlo: …».
2. **Actor** = persona (`study_id`, `user_id`, rol de estudio, cualificaciones, roles en el proyecto del recurso) **o** agente de IA. `AiActor` no tiene ningún permiso de acción de estado: `can` lo rechaza siempre y un test recorre **todas** las acciones del enum.
3. **Acciones** (`Action`): `PROMOTE`, `APPROVE_DELIVERABLE`, `EDIT_DELIVERABLE` (las tres usan la autoridad de la fase del recurso; la ficha y «iniciar proyecto» son `EDIT_DELIVERABLE` y `PROMOTE`), `PAUSE`, `RESUME`, `MANAGE_PROJECT_MEMBERS`, `MANAGE_STUDY_MEMBERS`, `EDIT_SETTINGS`, `SCORE`, `CREATE_OPPORTUNITY`, `READ`. Las de lectura quedan abiertas a cualquier miembro activo del estudio.
4. **Recurso**: `ProjectResource(project_id, phase)` (la fase actual decide quién promueve) o `StudyResource`.
5. **Roles por proyecto** (`ProjectRole`): `PROJECT_DIRECTOR`, `TECHNICAL_LEAD`, `ARCHITECT`, `SITE_COLLABORATOR` y las tres funciones del PRD que no coinciden con los roles de estudio: `LICENSED_SIGNATORY`, `SITE_MANAGEMENT`, `SPONSOR`. Esto resuelve el mapeo que RGB-8 dejó para RGB-4. Una persona puede tener varios roles en un proyecto.
6. **Matriz de promoción** (PRD, tabla de entregable de salida), una sola fuente `PROMOTION_AUTHORITY`:
   | Fase | Promueve |
   | --- | --- |
   | 0 Oportunidad, 1 Inicio | rol de estudio socio o director |
   | 2 Briefing, 3 Anteproyecto | `PROJECT_DIRECTOR` **de ese proyecto** |
   | 4 Básico, 5 Ejecución | `LICENSED_SIGNATORY` de ese proyecto |
   | 6 Obra | `SITE_MANAGEMENT` de ese proyecto |
   | 7 Cierre | `SPONSOR` de ese proyecto |
7. **Cualificaciones de estudio**: siguen existiendo (las concede el socio, RGB-2a) y se interpretan como **habilitación**: quien tiene la cualificación puede recibir esa función en un proyecto, y solo entonces promueve. Asignar `LICENSED_SIGNATORY`, `SITE_MANAGEMENT` o `SPONSOR` en un proyecto exige que la persona tenga la cualificación de estudio correspondiente.
8. **Asignación por proyecto**: tabla `project_members` (`study_id`, `project_id`, `user_id`, `role`, quién asignó y cuándo), única por (`project_id`, `user_id`, `role`), con RLS por estudio y auditoría de cada alta y baja (misma transacción). Rutas `GET /api/projects/{code}/members`, `POST /api/projects/{code}/members`, `DELETE /api/projects/{code}/members/{id}`. Asigna un socio, un director o el director de proyecto de ese proyecto (este último solo roles de equipo, nunca las tres funciones de firma, dirección facultativa y sponsor).
9. **Los casos de uso dejan de decidir**: `PromotionService`, `StartProject`, `UpdateProjectSheet`, `PromoteProjectSheet`, `GetProjectSheet` y las pausas llaman a `can` (el scoring, los ajustes y el alta quedan para RGB-4b, ver el log) a través de un puerto `AccessPolicy` (con `create_autospec` en los tests). `has_authority`/`who_can` y `can_manage_pauses` se retiran al final, cuando nada los use.
10. **Modo `dev`**: el contexto ficticio de desarrollo sigue funcionando. En `dev` las funciones del proyecto se deducen del rol de estudio y de las cualificaciones del usuario ficticio (como funcionaba la autoridad antes); en `AUTH_MODE=supabase` solo cuentan las filas reales de `project_members`.
11. **Errores**: se mantiene el 403 `no_authority` con `allowed` (mismo cuerpo que hoy, el front no cambia). Los rechazos se siguen auditando.

## Fuera de alcance

- Pantalla para asignar equipo al proyecto (front, tarea aparte).
- Permisos de lectura finos por proyecto (el MVP no tiene acceso de cliente; todo miembro activo lee todo el estudio).
- Permisos de entregables con estados documentales (RGB-36) y del trámite municipal (RGB-37): usarán `can` cuando se hagan.

## Decisiones (1 confirmada el 2026-10-26; el resto, supuestos a confirmar al revisar)

1. **Confirmada.** **Fases 2 y 3 solo las promueve el director de proyecto de ese proyecto**, no cualquier director de proyecto ni socio/director (es lo que dice el PRD). Si el estudio quiere que socio y director puedan suplirlo, es una línea en la matriz.
2. **El socio y el director no heredan** las funciones de firma, dirección facultativa y sponsor: se les asignan como a cualquiera.
3. **Quien no tiene rol en el proyecto** (aunque sea director de proyecto de otro) no promueve ni pausa en él.
4. **Pausar/reanudar**: director de proyecto de ese proyecto, o socio/director del estudio (como hoy, pero acotado al proyecto para el primero).
5. **Scoring, ajustes y alta de oportunidades**: socio y director (hoy puede cualquier rol; es lo que `estado.md` lista como pendiente de RGB-4). El alta también el director de proyecto.

## Plan de trabajo (TDD, en este orden)

1. Dominio `access`: `Action`, `ProjectRole`, `Actor`/`AiActor`, `Decision`, `PROMOTION_AUTHORITY` y `can`. Tests puros: una prueba por fase y por rol (matriz completa), la IA rechazada en todas las acciones, sin rol en el proyecto, varios roles.
2. Migración `011_project_members.sql` con `protect_study_table`; puerto `ProjectMembers` y adaptador Postgres. Tests con Postgres real: RLS entre estudios, unicidad, auditoría.
3. Caso de uso `ManageProjectMembers` (asignar, listar, quitar) con `create_autospec`, y sus rutas.
4. Puerto `AccessPolicy` + adaptador que carga los roles del proyecto; sustituir las comprobaciones en los casos de uso existentes, uno por uno, con sus tests actualizados (un test que falla se corrige justificándolo, no se debilita).
5. Test de arquitectura: nadie fuera de `access` decide permisos por rol (`context.role in …` prohibido en `application`).
6. Retirar `authority.py` y `can_manage_pauses`; pasar el `RequestContext` de `dev`.
7. Verificación de punta a punta con la API real y Postgres, auditoría del 403 por fase. Juez. PR.

## Archivos

**Nuevos** (`backend/`)
- `app/access/domain/`: `actions.py`, `actor.py`, `project_roles.py`, `policy.py` (`can`, `Decision`, matriz), `ports.py`.
- `app/access/application/manage_project_members.py`, `app/access/infrastructure/postgres_project_members.py`.
- `app/api/project_member_routes.py`.
- `migrations/011_project_members.sql`.
- `tests/access/{domain,application,infrastructure}/…`, `tests/api/test_project_member_routes.py`.

**Modificados**
- `app/lifecycle/application/promotion_service.py`, `app/opportunity/application/{start_project,update_project_sheet,promote_project_sheet,get_project_sheet}.py`, `app/timing/…` (pausas), scoring y alta de oportunidades.
- `app/api/dependencies.py` (cableado y contexto `dev`), `app/api/main.py` (router).
- `tests/test_architecture.py`, los tests de esos casos de uso.
- `docs/arquitectura.md` (contexto `access`), `docs/estado.md`, `docs/plans/RGB-4/implementation_log.md`, Notion y el artifact «Estado de RGB Proyectos».

**Retirados**: `app/lifecycle/domain/authority.py`, `can_manage_pauses`.
