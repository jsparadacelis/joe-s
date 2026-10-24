# Registro de ejecución · Topes del plan y siembra del estudio de desarrollo

Rama `fix/backend-plan-limits`. Plan: [plan.md](plan.md).

## Hecho (TDD: rojo -> verde en cada paso)

1. **Topes en el dominio.** Tests en rojo (`test_plan.py`: 521, 2147483648, 99999999999, 1e21 semanas; factores 0,09 y 1e-10; mensajes) y luego `MAX_WEEKS = 520`, `MIN_FACTOR = 0.1`, `MAX_FACTOR = 10` en `opportunity/domain/plan.py` y mensajes idénticos a los del front en `errors.py`. Un test comprueba que las plantillas y factores por defecto del PRD siguen en rango.
2. **422 en vez de 500.** `backend/tests/api/test_validation_errors.py` usa el servicio real sobre puertos simulados y comprueba que ningún valor fuera de rango llega al repositorio, que la respuesta es `{detail:{code,message}}` y que lleva la cabecera CORS. Los cuerpos de los PUT (`WeeksInput`, `FactorInput`) pasan a `Any` para que valide solo el dominio.
3. **Estudio ficticio.** `backend/app/shared/seed_dev.py` + `scripts/dev.sh`; tests en `backend/tests/shared/test_seed_dev.py` (Postgres real, esquema efímero, RLS forzada).

## Decisiones

- **Un solo punto de validación.** Con `list[int]` / `Decimal` en el modelo de Pydantic, un `1e309`, un `NaN` o un tipo erróneo producían el 422 por defecto de FastAPI (con `detail` en lista) y los enteros gigantes pasaban hasta la base. Ahora los modelos aceptan cualquier JSON y el dominio decide: siempre `invalid_weeks` / `invalid_factor`. Efecto lateral: `1.0` (float) ya no se acepta como semana (antes Pydantic lo convertía a 1); el front envía enteros.
- **Unificar el 422 por defecto (punto 2): sí.** Un manejador global convierte `RequestValidationError` (cuerpo ausente o roto, tipología/escala desconocida, parámetros de consulta) en `{detail:{code:"invalid_request", message:"La solicitud no es válida. Revisa los datos enviados."}}`. Motivo: un único formato para quien consuma la API. No rompe el front: `lib/api.ts` trataba cualquier `detail` no objeto con el mensaje genérico; ahora, con objeto `{code,message}`, muestra el mensaje del servidor (en español). Es un cambio visible también en `GET /api/plan` y en las rutas de promoción. Un cuerpo con un entero de más de 4300 dígitos hace que FastAPI responda 400 («error parsing the body»); otro manejador lo convierte al mismo 422 `invalid_request`.
- **Factor con más de 2 decimales.** La columna es `numeric(4,2)`: 0,104 se guarda como 0,10 (dentro del rango, sin error). No se cambia aquí; si se quiere, cuantizar en el dominio sería otra tarea.
- **Siembra (punto 3).** Módulo Python ejecutable `python -m backend.app.shared.seed_dev`, no una migración, para que producción y Supabase nunca lo reciban. Idempotente (`INSERT ... ON CONFLICT DO NOTHING` con el contexto de estudio fijado, porque `studies` fuerza la RLS). Se niega a correr contra un host no local (`localhost`, `127.0.0.1`, `::1`, `db`) salvo `--force`, y el mensaje no incluye la URL. `scripts/dev.sh` lo llama tras migrar. Documentado en `docs/despliegue.md` y `README.md`.
- No se tocaron migraciones ni `frontend/`. La columna y los `CHECK` de la migración 005 ya admiten el rango nuevo.

## Verificación

- `ruff check backend` y `ruff format --check backend`: limpios.
- `pytest backend` con Postgres local (`back-db-1`, puerto 54329): 412 passed.
- API real local (uvicorn, base `back-db-1`) con origen `http://localhost:3000`: PUT con 521 y con 99999999999 semanas -> 422 `invalid_weeks`; factor 1e-10, `NaN` y 1e309 -> 422 `invalid_factor`; todos con `access-control-allow-origin`. PUT válido de plantilla y de factor -> 204 (el contrato de la ruta es 204, no 200). Nada contra Cloud Run.
- No verificado: `bash scripts/dev.sh` completo (levanta también el front con npm); se comprobó cada paso de la API por separado y `bash -n scripts/dev.sh`. En la base local el estudio ya existía, así que la creación desde cero solo la cubre el test.
