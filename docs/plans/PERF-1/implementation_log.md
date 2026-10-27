# PERF-1: registro de implementación

- Rojo: tests del pool (importación fallida), ajustes y lifespan.
- Verde: `db.py`, `config.py`, `main.py`. Suite completa: 2099 tests en verde; `ruff check` y `ruff format` limpios.
- Ajuste de test (no es debilitarlo): el test del lifespan comparaba dos PIDs consecutivos, pero con `open(wait=False)` el pool puede crear una segunda conexión mientras la primera se abre. Ahora comprueba que seis transacciones usan como mucho `max_size` conexiones, frente a una por transacción sin pool.
- Despliegue: ver `docs/despliegue.md`.
