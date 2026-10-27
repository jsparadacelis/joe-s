# PERF-1: registro de implementación

- Rojo: tests del pool (importación fallida), ajustes y lifespan.
- Verde: `db.py`, `config.py`, `main.py`. Suite completa: 2099 tests en verde; `ruff check` y `ruff format` limpios.
- Ajuste de test (no es debilitarlo): el test del lifespan comparaba dos PIDs consecutivos, pero con `open(wait=False)` el pool puede crear una segunda conexión mientras la primera se abre. Ahora comprueba que seis transacciones usan como mucho `max_size` conexiones, frente a una por transacción sin pool.
- Despliegue: ver `docs/despliegue.md`.

## Despliegue y medición (2026-10-27)
- Cloud Run `rgb-api-00008-ln7` con `DB_POOL_MAX=4` (anterior: `rgb-api-00007-5tc`). Vuelta atrás: `gcloud run services update-traffic rgb-api --to-revisions rgb-api-00007-5tc=100`, o quitar el pool con `--remove-env-vars DB_POOL_MAX`.
- `GET /api/portfolio` en el servidor: ~1,2 s → ~0,64 s (Cloud Logging). Desde un cliente externo se suman ~0,45 s de red.
- Lo que queda (~0,6 s) son los viajes por consulta entre `us-central1` y Irlanda: cada petición hace varias. Solo baja de verdad acercando la API a la base de datos (Railway u otra región en la UE; el dueño lo evalúa). Mejoras menores posibles: fusionar `SET LOCAL ROLE` y `set_config` en una sola sentencia y quitar la comprobación al prestar la conexión (un viaje cada una).
