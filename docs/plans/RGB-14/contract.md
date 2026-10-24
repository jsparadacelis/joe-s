# RGB-14 · Contrato de la API

Fuente única entre los dos frentes. Ningún frente lo cambia por su cuenta: si necesita un cambio, lo pide al orquestador. Claves JSON en inglés (snake_case); mensajes de error en español.

Criterios (`criterion` keys, en este orden): `client_fit` (Encaje del cliente), `location` (Localización), `typology` (Tipología), `budget` (Presupuesto), `timeline` (Plazo), `source` (Fuente), `probability` (Probabilidad).

## `GET /api/settings/scoring` → 200

```json
{ "weights": { "client_fit": 1, "location": 1, "typology": 1, "budget": 1, "timeline": 1, "source": 1, "probability": 1 }, "threshold": 60 }
```
Defaults del dominio (pesos 1, umbral 60) cuando el estudio no tiene ajustes guardados.

## `PUT /api/settings/scoring` → 204

Cuerpo: el mismo JSON. Los 7 pesos obligatorios, números > 0 y ≤ 10 (hasta 2 decimales), suma > 0; `threshold` entero 1–100. Reemplaza los ajustes del estudio. Auditoría. Errores `422` `{"detail": {"code": "invalid_weights" | "invalid_threshold", "message": "…"}}` (tipos erróneos incluidos: valida el dominio, cuerpo tipado `Any`, como los ajustes del plan). Cambiarlos **no** altera scorings ya guardados.

## `POST /api/projects/{code}/scoring` → 201

Cuerpo: `{ "ratings": { "client_fit": 3, … 7 claves … } }` con enteros 1–5. Calcula con los ajustes vigentes, guarda una fila insert-only con ratings, pesos, umbral, nota y recomendación, y audita (quién, qué, cuándo). Respuesta:

```json
{ "project_code": "PRY-2026-001", "version": 1, "ratings": {…}, "weights": {…}, "threshold": 60,
  "score": 60.0, "recommendation": "pursue", "scored_by": "…", "scored_at": "2026-10-24T10:00:00Z" }
```
`recommendation`: `pursue` | `do_not_pursue`. `version`: 1, 2… por proyecto.
Errores, en este orden: `404 project_not_found` (mismo que las demás rutas) → `409 {"code":"not_an_opportunity","message":"Solo se puede puntuar una oportunidad (fase 0)."}` → `422 {"code":"invalid_ratings","message":"…","field":"<criterion>"}` (falta, no entero o fuera de 1–5; informa del primer criterio inválido en el orden de arriba; `field` ausente si el cuerpo no es un objeto).

## `GET /api/projects/{code}/scoring` → 200 | 404

Último scoring (misma forma que el POST) con además `history`: lista de `{version, score, recommendation, scored_at}` en orden descendente de versión. `404 project_not_found`, o `404 {"code":"scoring_not_found","message":"La oportunidad aún no tiene scoring."}`.

## Front

- `lib/scoring.ts`: `fetchScoringSettings`, `saveScoringSettings`, `saveScoring`, `fetchScoring`, `computeScore(ratings, weights)` con la misma fórmula (`100·Σ(p·r)/(5·Σp)`, 1 decimal) y `recommend(score, threshold)`.
- Página `/projects/[code]/scoring` (solo oportunidades reales; los `PRY-EJ-00N` de ejemplo muestran «Sin API»): siete selectores 1–5 accesibles, nota en vivo, umbral y recomendación («Recomendación: perseguir / no perseguir» — la decisión es de la persona, texto explícito), guardar, historial de versiones. Errores 422/409/404 en español junto al campo.
- `/settings`: nueva sección «Scoring» con los 7 pesos y el umbral (mismos límites en cliente), restauración de foco y `aria-live` como el editor del plan.
- Enlace «Puntuar oportunidad» desde la ficha de una oportunidad real (fase 0).
