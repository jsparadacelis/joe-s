# RGB-16 · Plan propuesto y promoción a Inicio o «no perseguir» (full-stack)

Tarea full-stack (P0, M, E2). Depende de RGB-9 (promoción), RGB-14 (scoring) y RGB-15 (plantillas), las tres en `main`. Bloquea RGB-17/19 (ficha). Flujo: contrato primero (abajo), Escritor de tests, Desarrollador, Tester, Juez, PR único con pantallazos.

Fuente: página RGB-16 del Backlog de Notion. Desde el scoring se elige la escala, se ve el plan propuesto, se ajustan las semanas y se promueve a la fase 1 (Inicio) o se descarta con motivo.

## Criterios de aceptación

- [ ] Solo socio o director pueden promover o descartar.
- [ ] El scoring y el plan quedan congelados.

## Supuestos provisionales

1. **Tipología y escala.** La tipología ya está en la oportunidad (RGB-13); la escala (`small`/`medium`/`large`) se elige en esta pantalla. El plan propuesto sale de `make_plan(tipología, escala)` con las plantillas y factores del estudio (`GET /api/plan`).
2. **Plan editable.** Siete semanas enteras entre 1 y 520 (mismos topes y mensajes que los ajustes del plan: `invalid_weeks`). Lo editado no se guarda hasta promover.
3. **Autoridad.** La de la fase 0 en el dominio de promoción (`lifecycle.domain.phases`): no se crea una regla nueva. Rechazos auditados, como en RGB-9.
4. **Promover exige un scoring guardado** (RGB-14). La nota o la recomendación no bloquean: la decisión es de la persona.
5. **Congelado.** Al promover, en una sola transacción: se inserta el plan confirmado como línea base (`project_plans`, solo inserción) y el contenido del entregable de salida de la fase 0 (versión congelada de RGB-9) lleva el scoring vigente (ratings, pesos, umbral, nota) y el plan. Nada se recalcula después.
6. **Ficha en borrador.** La ficha (RGB-17) no existe. El contenido congelado incluye los datos con los que arrancará (cliente, ubicación, tipología, escala y plan); el borrador como tal llega con RGB-17.
7. **No perseguir** reutiliza `POST /api/projects/{code}/do-not-pursue` (motivo obligatorio, ya implementado en RGB-9); aquí solo se añade el botón.
8. Permisos por rol reales: RGB-2 y RGB-4. Hoy el rol sale del contexto de desarrollo.

## Contrato

`POST /api/projects/{code}/start` · cuerpo `{ "scale": "small|medium|large", "weeks": [7 enteros] }`
- 200: `{ code, action: "promote", previous_phase: 0, current_phase: 1, frozen_version, plan: { project_type, scale, weeks_by_phase, total } }`
- 403 `no_authority`; 404 `project_not_found`; 409 si el proyecto no está en fase 0 o ya tiene plan; 422 `incomplete_deliverable` (sin scoring), `invalid_weeks`, `invalid_scale`, `invalid_request`.
- Todo rechazo de negocio queda en la auditoría, como en RGB-9.

`GET /api/projects/{code}/plan` · 200 `{ project_type, scale, weeks_by_phase, total, confirmed_at, confirmed_by }` o 404 `plan_not_found` si aún no se confirmó.

## Archivos

**Back** (`backend/`)
- `migrations/009_project_plans.sql`: `project_plans` (study_id, project_id, project_type, scale, weeks smallint[7], confirmed_by, confirmed_at; única por proyecto; RLS con `protect_study_table`; `REVOKE UPDATE, DELETE, TRUNCATE` + disparador `reject_alteration`).
- `app/opportunity/domain/`: `ProposedPlan`/validación de escala y semanas (reutiliza `validate_weeks`), errores nuevos (`InvalidScale`, `PlanAlreadyConfirmed`), puerto `ProjectPlans`.
- `app/opportunity/application/start_project.py`: caso de uso que valida, exige scoring, guarda la línea base, deja el contenido del entregable de la fase 0 y delega en `PromotionService.promote`.
- `app/opportunity/infrastructure/postgres_project_plans.py`.
- `app/api/opportunity_routes.py` (rutas nuevas) y `app/api/dependencies.py` (composición).
- `tests/`: dominio puro, caso de uso con `create_autospec`, infraestructura con Postgres real (RLS, solo inserción), rutas (403/404/409/422), auditoría y arquitectura DDD.

**Front** (`frontend/`)
- `lib/start.ts`: cliente de las dos rutas y de `GET /api/plan`, topes y mensajes de semanas iguales a los del servidor.
- `components/scoring/` (o `components/opportunity/`): `StartPanel` con escala, plan propuesto editable, «Promover a 1 · Inicio» (confirmación), «No perseguir» (motivo obligatorio) y errores accesibles (403 y 422 con foco gestionado).
- `app/projects/[code]/scoring/page.tsx`: monta el panel bajo el scoring (solo fase 0, solo proyectos reales).
- `__tests__/`: contrato del cliente, componente (teclado, axe, estados de error), página.
- Pantallazos en `docs/plans/RGB-16/screenshots/` (claro y oscuro, datos ficticios).

**Docs:** `implementation_log.md`, `docs/estado.md`, `docs/huecos-backend.md` si aplica, Notion y el artifact de estado.

## Fuera de alcance

Ficha del proyecto (RGB-17), permisos por rol (RGB-4), bloquear la promoción por nota, aviso de pausas vencidas.
