# RGB-13 · Contrato de la API

Fuente única entre los dos frentes. Ningún frente lo cambia por su cuenta: si necesita un cambio, lo pide al orquestador. Claves JSON en inglés (snake_case); mensajes de error en español.

## `POST /api/opportunities` → 201

Cuerpo:

| Campo | Tipo | Obligatorio | Notas |
| --- | --- | --- | --- |
| `name` | string | sí | 1–120 caracteres tras `strip` |
| `client` | string | sí | 1–120 |
| `location` | string | sí | 1–200 |
| `project_type` | string | sí | uno de `single_family_house`, `rehabilitation`, `multi_family`, `facility`, `industrial`, `renovation_interiors` |
| `owner` | string | sí | responsable, texto libre, 1–120 (se guarda en `projects.responsible_id`) |
| `estimated_budget` | number \| null | no | euros, ≥ 0, hasta 2 decimales, ≤ 1 000 000 000 |
| `deadline` | string \| null | no | fecha ISO `yyyy-mm-dd` (plazo del encargo) |
| `source` | string \| null | no | fuente de la oportunidad, ≤ 120 |
| `decision_date` | string \| null | no | fecha ISO `yyyy-mm-dd` |

Respuesta 201:

```json
{ "code": "PRY-2026-001", "name": "…", "phase": 0, "status": "no_plan",
  "client": "…", "location": "…", "project_type": "industrial", "owner": "…",
  "estimated_budget": 125000.0, "deadline": "2026-12-31", "source": null, "decision_date": null }
```

- `code`: `PRY-{año}-{NNN}` (3 dígitos, por estudio y año; el siguiente número bajo `pg_advisory_xact_lock` para evitar duplicados). El proyecto se crea con `current_phase = 0`, `active = false`, `paused = false`, `traffic_light = null`, `next_milestone = null`.
- Efectos en una sola transacción con RLS: fila en `projects`, fila en `opportunities` y evento de auditoría (quién, qué, cuándo).

Errores: `422` con `{"detail": {"code": "required_field" | "invalid_field", "message": "…", "field": "<campo>"}}`. Mensajes: «El campo «{etiqueta}» es obligatorio.» / «El campo «{etiqueta}» no es válido: {motivo}.» con etiquetas en español (Nombre, Cliente, Localización, Tipología, Responsable, Presupuesto estimado, Plazo, Fuente, Fecha de decisión). Se informa del **primer** campo inválido, en el orden de la tabla. Cualquier otro 422 de FastAPI sale con `code: "invalid_request"` (ya existe).

## `GET /api/portfolio` → 200

```json
{ "as_of": "2026-10-24",
  "projects": [
    { "code": "PRY-2026-001", "name": "…", "phase": 0, "status": "no_plan",
      "next_milestone": null | { "name": "…", "date": null },
      "owner_id": "…" | null, "owner_name": null,
      "blocker": null, "days_since_update": 0, "phase_weeks": null } ] }
```

- `status`: `no_plan` (fase 0) · `paused` (si `paused`) · `green`/`amber`/`red` (`projects.traffic_light`) · `unknown` (resto). `phase_weeks` y `blocker` son `null` hasta RGB-16/21 y la tarea dueña del bloqueo.
- `days_since_update`: días enteros (UTC) desde `projects.updated_at`; `as_of`: hoy en UTC.
- Orden: por `code`. Todos los proyectos del estudio (supuesto 1 del plan). RLS aplica sola.

## `GET /api/projects/{code}` → 200 | 404

`{ "code", "name", "current_phase": 0 }`. 404: `{"detail": {"code": "project_not_found", "message": "No existe el proyecto {code}."}}` (el mismo que las rutas de promoción).

## Front: mapeo y estados

- `lib/portfolio.ts`: `fetchPortfolio()` llama a la API y mapea a camelCase; `status` `no_plan` → `no-plan`, añade `unknown` (etiqueta «Sin calcular», tono neutro, fuera de «En riesgo», opción en el filtro de semáforo); `nextMilestone.date` puede ser `null` («Sin fecha», no cuenta en «Hitos en 7 días»); `owner = owner_name ?? owner_id ?? "Sin responsable"`; `phaseWeeks` puede ser `null` en cualquier estado: en `no-plan` muestra «Sin plan hasta promover», en `unknown` «Sin calcular»; el resumen usa `as_of` como `today`.
- Formulario `/opportunities/new`: campos y etiquetas en español (Nombre, Cliente, Localización, Tipología —con las etiquetas de `lib/plan-settings.ts`—, Responsable, Presupuesto estimado (€), Plazo, Fuente, Fecha de decisión); validación en cliente con los mismos límites y mensajes que la API; los errores 422 de la API se muestran junto al campo (`field`); éxito → redirige a `/portfolio`.
