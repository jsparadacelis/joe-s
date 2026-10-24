# RGB-13 · Alta de oportunidad (full-stack)

Tarea full-stack (P0, S, E2). Depende de RGB-8 (hecha). Primera escritura en `projects` del sistema: desbloquea una cartera con datos reales. Orquestada como dos frentes (back y front) con contrato fijado antes ([contract.md](contract.md)), un Integrador y un Juez sobre la rama integrada. Ver [huecos-backend.md](../../huecos-backend.md).

Fuente: página RGB-13 del Backlog de Notion. Alcance: formulario con cliente, localización, tipología, presupuesto estimado, plazo, fuente, responsable y fecha de decisión. Criterio: «la oportunidad aparece en la cartera en fase 0 con “Sin plan hasta promover”».

## Alcance

**Back (`backend/`)**
- Migración `006_opportunities.sql`: tabla `opportunities` (1:1 con `projects`), con RLS (`protect_study_table`) y sin tocar las tablas existentes.
- Contexto `opportunity`: dominio (`Opportunity`, validación, tipología con los `ProjectType` ya existentes), caso de uso `create_opportunity` (crea el proyecto en fase 0 con código automático `PRY-AAAA-NNN` y la oportunidad en una transacción, y escribe en el registro de auditoría), adaptador Postgres.
- `POST /api/opportunities`.
- `GET /api/portfolio` mínimo (necesario para el criterio de aceptación) y `GET /api/projects/{code}` mínimo (para que el clic en una fila no dé 404).

**Front (`frontend/`)**
- Pantalla `/opportunities/new` («Nueva oportunidad») con el formulario, validación en cliente, errores de la API en español y redirección a la cartera.
- Botón «Nueva oportunidad» en `/portfolio`.
- La cartera lee de `GET /api/portfolio` (cliente en `lib/portfolio.ts`; los datos de ejemplo salen del camino de producción): mapeo snake_case → camelCase, estado `unknown` («Sin calcular», fuera de «En riesgo»), hito con fecha nula, `owner_id`/`owner_name`, `as_of` como fecha de referencia del resumen, `phaseWeeks` nulo.
- `lib/projects.ts`: `fetchProject`/`listProjects` leen de `GET /api/projects/{code}` para que la ficha de una oportunidad creada se abra.

## Supuestos provisionales (pendientes de decisión del usuario; ver huecos-backend.md)

1. En la cartera entran **todos** los proyectos del estudio (sin ocultar cerrados ni descartados).
2. El próximo hito sale del texto `projects.next_milestone` (sin fecha); `internal_milestones` queda fuera.
3. El semáforo es el guardado en `projects.traffic_light`; si no hay y no es fase 0 ni pausa, el estado es `unknown`. No hay cálculo por consumo del plan hasta RGB-16/21.
4. El responsable es texto libre guardado en `projects.responsible_id`; `owner_name` es nulo hasta RGB-2/RGB-4.
5. No se comprueban permisos por rol (RGB-4); cualquier rol del contexto de desarrollo puede dar de alta.
6. El «nombre» es un campo obligatorio del formulario (el PRD no lo lista, pero `projects.name` es obligatorio).

## Criterios de aceptación

- [ ] `POST /api/opportunities` crea proyecto + oportunidad en fase 0 con código automático, auditado, bajo RLS (aislamiento A/B de estudios); validaciones con 422 `{detail:{code,message,field}}` en español.
- [ ] La oportunidad creada aparece en `GET /api/portfolio` en fase 0, estado `no_plan`, y en la cartera como «Sin plan hasta promover».
- [ ] Formulario accesible (etiquetas, errores con `aria-invalid`/`aria-describedby`, foco), todo en español, solo tokens, sin datos reales; tras crear, vuelve a la cartera y el clic en la fila abre la ficha de la oportunidad (sin 404).
- [ ] Back: TDD/DDD, dominio puro, casos de uso con puertos simulados, infraestructura con Postgres real; `ruff` y `pytest backend` en verde. Front: `lint`, `typecheck`, `test`, `build` en verde.
- [ ] Prueba de punta a punta (API local + build real + navegador): alta → cartera → ficha. Contra Cloud Run, solo lectura.
- [ ] Pantallazos en `docs/plans/RGB-13/screenshots/` (formulario vacío, errores, éxito/cartera con la oportunidad, claro y oscuro).

Fuera de alcance: scoring (RGB-14), plan propuesto y promoción (RGB-16), ficha (RGB-17), usuarios y roles (RGB-2/4), edición o borrado de la oportunidad, pausas (RGB-21).

## Flujo

Ver la skill `skills/orchestrate-task/SKILL.md`: contrato → frentes en paralelo en worktrees (`feat/RGB-13-back`, `feat/RGB-13-front`) → Integrador (`feat/RGB-13`) → Juez (Opus) → PR único con pantallazos, merge con checks en verde (autorizado por el usuario hasta nuevo aviso), documentos, Notion y memoria.
