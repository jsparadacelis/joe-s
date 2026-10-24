# RGB-14 · Registro del frente back

Los cuatro roles (Escritor de tests, Desarrollador, Tester y verificación) se ejecutaron en **una sola sesión** de un único agente, en orden, no como subagentes independientes: no hay revisión cruzada real entre ellos. El Juez y la integración quedan para el orquestador.

## Qué se hizo

- `backend/migrations/008_scoring.sql`:
  - `scoring_settings`: una fila por estudio (`UNIQUE (study_id)`) con `weights jsonb` y `threshold` 1-100. Solo existe si el estudio cambió algo; los valores por defecto (pesos 1, umbral 60) viven en el dominio. Guardar reemplaza la fila entera.
  - `opportunity_scorings`: insert-only. Ratings, pesos y umbral usados, nota (`numeric(4,1)` 0-100), recomendación, quién y cuándo, `version` por proyecto (`UNIQUE (project_id, version)`), FK compuesta `(study_id, project_id)`. `protect_study_table` en ambas, `REVOKE UPDATE, DELETE, TRUNCATE FROM rgb_app` y trigger `reject_alteration` (el de 004).
- Dominio (`opportunity/domain/scoring.py`, errores en `errors.py`, puertos en `ports.py`): `Criterion`, `Recommendation`, `compute_score` (`100·Σ(p·r)/(5·Σp)`, `Decimal`, 1 decimal half-up), `recommend` (nota >= umbral), `validate_ratings`, `validate_settings`, valores por defecto.
- Casos de uso (`opportunity/application/scoring.py`): `ScoringSettingsService` (`get_settings`, `update`) y `ScoringService` (`score`, `read`).
- Infraestructura (`opportunity/infrastructure/postgres_scoring.py`): `PostgresScoringSettings`, `PostgresScorings`.
- API (`api/scoring_routes.py`, `dependencies.py`, `main.py`): las cuatro rutas del contrato.

## Decisiones

- Orden del `POST`: proyecto (404, con `FOR UPDATE`) -> fase 0 (409) -> ratings (422). El bloqueo de la fila del proyecto serializa guardados simultáneos y da versiones consecutivas; el índice único es la segunda barrera.
- Auditoría: `opportunity_scoring` / código / `score` con `version` y el instante guardado (ratings, pesos como texto, umbral, nota, recomendación); `scoring_settings` / `scoring` / `update` con valor anterior y nuevo. Los rechazos (404/409/422) no cambian nada y no se auditan (como RGB-21). Auditoría y fila van en la misma transacción.
- La recomendación compara la nota ya redondeada con el umbral (es lo que se muestra y se guarda).
- Pesos: enteros, flotantes o `Decimal` finitos, no booleanos, `0 < p <= 10`, máximo 2 decimales; los 7 obligatorios y ninguna clave más (la suma > 0 queda garantizada). Umbral: solo `int` (60.0 y `true` se rechazan). Ratings: solo `int` 1-5 (3.0, `true` y cadenas se rechazan).
- Cuerpos tipados `Any` (RootModel) para que el dominio sea quien valida, como en los ajustes del plan. Un cuerpo ausente o JSON inválido lo rechaza el framework con el 422 habitual `invalid_request`.
- Los pesos se guardan en JSON como números (`1.0`): el valor es lo que cuenta, no su representación.
- `scored_at` se devuelve en UTC con segundos (`2026-10-24T10:00:00Z`).

## Desviaciones del contrato

Ninguna bloqueante. Puntos que el contrato no fija y se resolvieron así:

- Una clave de más en `ratings` se rechaza con `invalid_ratings` y `field` = esa clave (mensaje «El criterio «x» no existe.»). El front solo recibe `field` de criterios reales en el flujo normal.
- Claves de más en el nivel superior del cuerpo de `PUT /api/settings/scoring` se **ignoran** (204); en `weights` se rechazan.
- Cuerpo que no es objeto en el `PUT` de ajustes -> `invalid_weights`.
- Los pesos se devuelven como números JSON (`1.0` en lugar de `1`; iguales para cualquier cliente JS).

## Tests correctos y justificados

- `test_postgres_scoring.py`: la primera versión comparaba `weights->>'client_fit' = '1'`, pero el JSON guardado es `1.0`. Se cambió a comparar el valor numérico (`::numeric = 1`): la representación del JSON no es parte del contrato.
- `test_scoring_routes.py`: la primera versión daba por hecho que `json=None` del cliente de pruebas era un `null` JSON que llegaba al dominio; en realidad no envía cuerpo y el framework responde 422 `invalid_request`. Se separó en dos tests: `null` JSON real (`content=b"null"`) llega al dominio, y el cuerpo ausente da `invalid_request`. Ninguno se debilitó: se comprobó el comportamiento real con curl.
- Se corrigió en el test de dominio un cálculo de comentarios confuso (empate 56,25 -> 56,3) y un valor esperado erróneo (31,4 y no 24,8: 100·11/35).

## Verificación

- TDD: los tests se commitearon primero en rojo (errores de importación) y luego se implementó.
- `ruff check backend` y `ruff format --check backend` limpios.
- `pytest backend`: 865 passed (658 previos + 207 nuevos de scoring), con Postgres local.
- API local (uvicorn en el puerto 8791 contra `back-db-1`, migración 008 aplicada con `python -m backend.app.shared.migrate`): alta de oportunidad, ajustes por defecto, GET sin scoring (404 `scoring_not_found`), 404 de proyecto, 409 con un proyecto en fase 2, 422 de rango (`field: timeline`), POST todo a 3 = 60,0 `pursue`, PUT de pesos (budget 9) y umbral 90 con 204, GET del scoring antiguo sin cambios (60,0, pesos 1, umbral 60), segundo POST = 84,0 `do_not_pursue` con los pesos nuevos y versión 2, historial [2, 1]. Intentos de romperla: NaN/Infinity, 1e400, entero de 5000 dígitos, JSON inválido, cuerpo vacío y `null`, booleanos, cadenas, 3.0, 0, pesos 0 / todos 0 / 10,001 / 0,001, claves de más y de menos, umbral 60.0 / true / 0 / 1e2 / ausente, ratings como lista, código de proyecto con inyección SQL: todos 422/404 con mensaje en español; ningún 500; la fase del proyecto no cambió y la auditoría tiene un evento por guardado y por `PUT`.
- Limpieza: se borraron de la base local las filas de prueba (desactivando y reactivando el trigger de `opportunity_scorings` en la misma transacción, solo en local). Nada contra Cloud Run.

## No verificado

- Migración 008 sobre Supabase/Cloud Run (no se toca nada remoto): queda para el despliegue.
- Permisos por rol (RGB-4): hoy cualquier rol puede puntuar y editar ajustes, como los ajustes del plan.
