# RGB-21 · Contrato de la API

Fuente única entre los dos frentes. Ningún frente lo cambia por su cuenta: si necesita un cambio, lo pide al orquestador. Claves JSON en inglés (snake_case); mensajes de error en español; fechas ISO `yyyy-mm-dd` en UTC.

## Objeto `Pause`

```json
{ "id": "…uuid…", "phase": 1, "reason": "client_wait",
  "started_on": "2026-10-24", "expected_resumption": "2026-11-09",
  "resumed_on": null, "overdue": false, "days_overdue": 0 }
```

- `reason`: `client_wait` | `authority_wait` | `internal_decision` | `other` (los de `backend/app/timing/domain`).
- `phase`: fase del proyecto cuando se abrió la pausa (1 a 7).
- `overdue`: la pausa está abierta y hoy (UTC) es posterior a `expected_resumption`; `days_overdue` = días enteros de retraso (0 si no).

## `POST /api/projects/{code}/pause` → 201

Cuerpo: `{ "reason": "<motivo>", "expected_resumption": "yyyy-mm-dd" }`. Respuesta: la `Pause` abierta. Efectos en una sola transacción con RLS: fila en `pauses`, `projects.paused = true` y auditoría (quién, qué, cuándo).

## `POST /api/projects/{code}/resume` → 200

Sin cuerpo. Respuesta: la `Pause` cerrada (`resumed_on` = hoy, `overdue` false). Efectos: `projects.paused = false`, auditoría.

## `GET /api/projects/{code}/pauses` → 200

`{ "active": <Pause> | null, "history": [<Pause>, …] }`; `history` son las cerradas, de la más reciente a la más antigua.

## Errores (`{"detail": {"code", "message", "field"?}}`)

| Estado | `code` | Mensaje | Cuándo |
| --- | --- | --- | --- |
| 404 | `project_not_found` | «No existe el proyecto {code}.» | código inexistente |
| 403 | `not_allowed` | «Solo el director de proyecto o la dirección pueden pausar o reanudar.» | rol sin autoridad (auditado) |
| 409 | `already_paused` | «El proyecto ya está en pausa.» | pausar con una pausa abierta |
| 409 | `not_paused` | «El proyecto no está en pausa.» | reanudar sin pausa abierta |
| 422 | `cannot_pause_opportunity` | «Una oportunidad aún no tiene reloj: se puede pausar desde la fase 1.» | fase 0 |
| 422 | `required_field` / `invalid_field` | «El campo «Motivo» no es válido: no es un motivo admitido.» / «El campo «Fecha prevista de reanudación» es obligatorio.» / «…no es válido: no es una fecha existente.» / «…no es válido: no puede ser anterior a hoy.» | validación; se informa del primer campo inválido en el orden `reason`, `expected_resumption`; `field` es `reason` o `expected_resumption` |

Orden de comprobación al pausar: proyecto existe (404) → permiso (403) → fase 0 (422) → validación de campos (422) → ya en pausa (409).

## Cambio aditivo en `GET /api/portfolio`

Cada elemento de `projects` gana `"pause": null | { "reason", "expected_resumption", "overdue", "days_overdue" }`. `status` sigue siendo `paused` cuando hay pausa abierta. Una pausa abierta existente solo en `projects.paused` (sin fila en `pauses`) devuelve `status: "paused"` y `pause: null`.

## Front: textos y estados

- Etiquetas de motivo (las de `lib/timing.ts`): «Espera del cliente», «Espera de organismo», «Decisión interna», «Otra».
- Cartera, fila en pausa: chip «En pausa» + «Reanudación prevista el dd/mm/aaaa»; si `overdue`: «Vencida hace N día(s)» en texto (no solo color).
- «Plan y tiempos» (proyecto real): panel «Pausa activa» (motivo, desde, fecha prevista, «Vencida…» si aplica) con botón «Reanudar»; botón «Pausar proyecto» (formulario: Motivo, Fecha prevista de reanudación) cuando no hay pausa; historial de pausas cerradas. Fase mayor que 0 sin plan base: semanas «Sin calcular». Errores de la API (403, 409, 422) en español junto a la acción; `PRY-EJ-00N` sin botones.
