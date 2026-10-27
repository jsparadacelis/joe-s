# PERF-1: pool de conexiones a la base de datos

## Problema
Con la API en `us-central1` y el pooler de Supabase en `aws-0-eu-west-1`, toda petición que toca la base de datos tarda ≥ 1,2 s (medido en Cloud Logging el 2026-10-27: GET 1,2 s, crear oportunidad 1,75 s, iniciar proyecto 2,76 s; `OPTIONS` 2 ms). `shared/db.py` abría una conexión nueva por transacción (TCP + TLS + autenticación, varios viajes transatlánticos).

## Cambio
- `shared/db.py`: `open_pool(url, min_size, max_size)` y `close_pools()`. `study_transaction` e `identity_transaction` usan el pool si existe para esa URL y, si no, abren una conexión directa como antes (los tests no cambian).
- `Settings.db_pool_max` (`DB_POOL_MAX`, 0 = sin pool). `create_app` abre el pool al arrancar y lo cierra al parar (lifespan). La apertura no espera a la base de datos para que `/api/health` responda aunque esté caída.
- `psycopg[binary,pool]` en `requirements.txt`.
- Cada conexión se comprueba al prestarla (`check_connection`, un viaje) y se recicla a los 10 min o 60 s inactiva, por si el pooler cierra conexiones.

## Seguridad
Rol y estudio se fijan con `SET LOCAL` dentro de la transacción, así que no sobreviven al commit/rollback y no pasan al siguiente uso de la conexión (test explícito).

## Fuera de alcance
Mover la API de región (decisión del dueño: de momento no; se evalúa Railway).

## Tests
`tests/shared/test_db.py::TestPool`, `tests/shared/test_config.py`, `tests/api/test_pool_lifespan.py`.
