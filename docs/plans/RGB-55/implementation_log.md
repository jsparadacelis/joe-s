# RGB-55: log de implementación

## 2026-11-22

Un PR con un commit por slice. Cada commit lleva su test en rojo y el código que lo pone en verde.

| Slice | Commit | Viajes en `GET /api/projects/{code}` |
|---|---|---|
| 1. Contador y punto de partida | `75fccab` | 12 |
| 2. `resolve_member` fija el estudio | `d03c676` | 11 |
| 3. Una transacción en el piloto | `d6877fa` | 6 |
| 4. La activación se confirma aunque el endpoint falle | `f74bd77` | 6 |
| 5. Comprobar la conexión del pool solo si puede estar muerta | `f3f38b7` | **5** |

Secuencia final, fijada en `test_request_round_trips_postgres.py`: `BEGIN · role · resolve+study · query · COMMIT`.

Los endpoints sin migrar bajan de 12 a 9: −1 por el slice 2 y −2 por el slice 5. `/api/portfolio` lo comprueba en el mismo test.

### Cómo se cuentan los viajes

`backend/tests/support/statements.py` activa el trace de libpq (`pgconn.trace`) en cada conexión abierta con `Connection.connect`, que es lo que llama el pool. Cuenta los mensajes `Query` y `Sync` del cliente, porque cada uno espera respuesta del servidor. No hace falta `log_statement` ni tocar la configuración de Postgres. Un test de control comprueba la cuenta con sentencias conocidas.

### Desviaciones del plan

- **Slice 3, tests unitarios de la ruta:** `test_opportunity_routes.py` simulaba `portfolio_unit_of_work` para `GET /api/projects/{code}`. Ahora la ruta depende de `authenticated_portfolio_unit_of_work`, así que el fixture `client` simula también esa dependencia. Las aserciones de los tres tests no cambian: lo que cambia es el punto de enganche, no lo que se comprueba. El plan decía «sin tocar los tests existentes», y esto es la excepción.
- **Slice 3, test del `COMMIT` fallido:** la simulación cierra la conexión antes de lanzar el error, que es lo que pasa cuando se cae durante el `COMMIT`. Sin cerrarla, la conexión quedaba a mitad de transacción y bloqueaba el `DROP SCHEMA` de la limpieza.
- **Slice 4, cómo se detecta la activación:** `PostgresMemberResolver` anota en `activated` si la última resolución activó una invitación. `authenticated_unit` hace `COMMIT` en ese momento y vuelve a fijar rol y estudio con `enter_study`, una función nueva de `db.py` que también usa `study_transaction`.
- **Slice 5, la comprobación no se salta sin más:** antes de reutilizar una conexión, un `select` con espera cero mira si el servidor ya ha enviado algo, lo que ocurre cuando cierra la conexión. No es un viaje a la base. Solo se hace la comprobación real (consulta vacía) si hay algo pendiente o si la conexión no se ha usado en 30 s. Queda sin cubrir una caída silenciosa (sin aviso del servidor) en los 30 s siguientes a un uso: es raro, y el pool ya cierra las conexiones con 60 s de inactividad. Comprobado con mutación: sin el `select`, el test de la conexión terminada con `pg_terminate_backend` falla.

- **Slice 5, conexiones recién abiertas:** la primera CI falló en `test_the_endpoints_not_migrated_yet_keep_two_transactions`. El pool tenía dos conexiones, las reparte por turnos, y la segunda transacción cayó en una recién abierta que nunca se había usado; por eso se comprobó. Una conexión que el pool acaba de abrir está viva, así que el `configure` del pool anota su hora de creación y su primer uso no se comprueba. Test nuevo: `test_a_connection_the_pool_just_opened_is_not_probed`. Repetido 15 veces en local sin fallos.

### Pendiente

- **Producción tras el merge:** 20 lecturas de `GET /api/projects/{code}` con una sesión real (solo lecturas) y comparar la mediana en los logs de Cloud Run con los 240 ms medidos. Criterio: ≤ 120 ms.
- **Tarea siguiente:** migrar el resto de endpoints a `authenticated_unit` y eliminar la transacción propia de `request_context`.
