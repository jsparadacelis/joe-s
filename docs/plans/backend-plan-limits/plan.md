# Plan · Topes del plan y siembra del estudio de desarrollo

Cierra los fallos que el Tester encontró al conectar `/settings` con la API (PR #27).

## Resumen

1. **Topes en el dominio** (`opportunity.domain.plan`): semanas enteras entre 1 y 520 (7 valores) y factor entre 0,1 y 10, con los mismos códigos (`invalid_weeks`, `invalid_factor`) y los mensajes idénticos a los del front. Los valores por defecto del PRD siguen en rango (se comprueba con un test).
2. **Sin 500 por desbordes**: el rechazo ocurre en el dominio antes de tocar la base. Los cuerpos de los PUT pasan a validarse solo en el dominio (el modelo de la ruta acepta cualquier JSON), de modo que tipos incorrectos, listas de longitud errónea, `NaN`/`Infinity`/`1e309` y enteros gigantes dan 422 con `{detail:{code,message}}`. Los errores de validación de FastAPI (cuerpo ausente, JSON roto, parámetro de ruta o consulta inválido) se unifican con un manejador global a `{detail:{code:"invalid_request",message}}` en español. El front ya trata cualquier `detail` que no sea objeto como error genérico y, con objeto, muestra el mensaje: no se rompe.
3. **Estudio ficticio de desarrollo**: módulo `backend/app/shared/seed_dev.py` (`python -m backend.app.shared.seed_dev`), idempotente, que inserta el estudio `dev_study_id` con nombre ficticio. Lo llama `scripts/dev.sh` tras migrar. No es una migración (producción y Supabase no lo reciben) y se niega a correr contra un host que no sea local salvo `--force`. Se documenta en `docs/despliegue.md`.

## Archivos

- `backend/app/opportunity/domain/errors.py`, `backend/app/opportunity/domain/plan.py` (topes y mensajes).
- `backend/app/api/plan_routes.py` (cuerpos sin tipado estricto), `backend/app/api/main.py` (manejador 422).
- `backend/app/shared/seed_dev.py` (nuevo), `scripts/dev.sh`, `docs/despliegue.md`.
- Tests: `backend/tests/opportunity/domain/test_plan.py`, `backend/tests/api/test_plan_routes.py`, `backend/tests/api/test_validation_errors.py` (nuevo), `backend/tests/shared/test_seed_dev.py` (nuevo).
- Sin cambios de migración: la columna `numeric(4,2)` y los `CHECK` existentes ya admiten el rango nuevo.
