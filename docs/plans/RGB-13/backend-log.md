# RGB-13 · Registro del frente back

## Qué se hizo

- `backend/migrations/006_opportunities.sql`: tabla `opportunities` 1:1 con `projects` (UNIQUE `project_id`, FK compuesta `(study_id, project_id)`, CHECK de tipología y presupuesto >= 0, `protect_study_table`). No toca tablas existentes.
- Contexto `opportunity`: `Opportunity.from_input` (dominio puro, primer error en el orden del contrato), `RequiredField`/`InvalidField`, caso de uso `CreateOpportunity`, adaptador `PostgresOpportunities` (código `PRY-AAAA-NNN` bajo `pg_advisory_xact_lock` por estudio y año; máximo existente + 1).
- Contexto nuevo `portfolio` (solo lectura): `ProjectRecord`, `status_of`, `days_since`, `PortfolioQueries`, `PostgresProjects`.
- Rutas en `api/opportunity_routes.py`: `POST /api/opportunities`, `GET /api/portfolio`, `GET /api/projects/{code}`.

## Decisiones

- Las lecturas van en un contexto `portfolio` propio y no en `lifecycle`: es un modelo de lectura sin reglas de promoción, y así `lifecycle` no crece. Su `ProjectNotFound` repite código y mensaje del de `lifecycle` (contrato).
- Validación en dominio con valores `Any` en la ruta (como `plan_routes`): un único sitio decide `required_field`/`invalid_field`.
- Opcionales vacíos (`""` o solo espacios) cuentan como nulos. Obligatorios vacíos son `required_field`.
- Presupuesto: solo número JSON (no cadena ni booleano), finito, 0 a 1 000 000 000, máximo 2 decimales (se evalúa `Decimal(str(valor))`).
- Fechas: solo `aaaa-mm-dd` estricto y existente.
- Auditoría: entidad `project`, `entity_id` = código, acción `create_opportunity`, `new_value` con los datos (presupuesto como texto).
- El año del código es el año UTC del reloj.

## Motivos en los mensajes `invalid_field` (el contrato no los fija)

- texto: «debe ser un texto», «no puede superar los N caracteres», «contiene caracteres no permitidos»
- tipología: «no es una tipología admitida»
- presupuesto: «debe ser un número», «no puede ser negativo», «no puede superar 1.000.000.000 €», «admite como máximo 2 decimales»
- fechas: «debe ser una fecha con formato aaaa-mm-dd», «no es una fecha existente»

## Hallazgo del Tester

Un `\u0000` (o un sustituto suelto) en un texto provocaba un 500 de Postgres. Ahora es `invalid_field` (test añadido en `test_opportunity.py`).

Un test propio estaba mal planteado (`test_the_opportunity_must_belong_to_a_project_of_the_same_study` usaba un proyecto que ya tenía oportunidad y saltaba la UNIQUE antes que la FK). Se corrigió el montaje, no la aserción.

## Verificación

`ruff check backend` y `pytest backend`: 549 en verde. API local (uvicorn + `back-db-1`): alta válida 201, aparece en `/api/portfolio` (`no_plan`) y en `/api/projects/{code}`; 422 con CORS desde `http://localhost:3000`; 404 `project_not_found`.
