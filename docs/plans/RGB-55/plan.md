# RGB-55: una sola transacción por petición (piloto: `GET /api/projects/{code}`)

## Contexto

Medido en local con `log_statement=all` (RGB-54), `GET /api/projects/{code}` envía 12 sentencias a la base:

```
── Transacción 1: request_context → identity_transaction
 1  <vacía>              check_connection del pool
 2  BEGIN
 3  SET LOCAL ROLE rgb_app
 4  SELECT … FROM resolve_member($email, $sub)
 5  SELECT set_config('app.study_id', $1, true)
 6  COMMIT
── Transacción 2: portfolio_unit_of_work → study_transaction
 7  <vacía>              check_connection del pool
 8  BEGIN
 9  SET LOCAL ROLE rgb_app
10  SELECT set_config('app.study_id', $1, true)
11  SELECT p.code, p.name, …          ← la única consulta útil
12  COMMIT
```

Cada sentencia es un viaje de ida y vuelta: ~20 ms desde Cloud Run `europe-west1` hasta Supabase `eu-west-1`. La mediana medida en producción es de 240 ms.

**Objetivo:** 5 sentencias en este endpoint, `BEGIN · SET ROLE · resolve+estudio · consulta · COMMIT`, unos 100 ms.

**Alcance:** solo este endpoint. Los demás siguen con dos transacciones hasta que se revise el piloto; se migran en otra tarea. Hay dos slices que afectan a todas las peticiones porque tocan piezas compartidas: el 2 (resolver) y el 4 (pool). Están señalados en su apartado.

**Fuera de alcance:** rol y estudio dentro del JWT (la revocación dejaría de ser inmediata), el modo pipeline de psycopg y el resto de endpoints.

## Diseño

La transacción la abre una **unidad de trabajo autenticada** usada por la ruta. No se usa una dependencia de FastAPI con `yield`.

```python
# backend/app/api/opportunity_routes.py
@router.get("/projects/{code}")
def get_project(code: str, open_unit: AuthenticatedReadUnit) -> dict:
    try:
        with open_unit() as (context, queries):   # BEGIN, rol, resolve+estudio
            project = queries.project(code)
    except ProjectNotFound as error:              # COMMIT al salir del with (o ROLLBACK)
        raise HTTPException(404, ...) from error
    return {...}
```

- **Por qué así y no con `yield`:** el `COMMIT` ocurre al salir del `with`, dentro de la ruta y antes de que FastAPI serialice la respuesta. Así no dependemos de cuándo cierra FastAPI las dependencias con `yield`, que ha cambiado entre versiones; `requirements.txt` fija `fastapi>=0.109`, sin versión exacta.
- **El token se sigue verificando antes de pedir conexión.** Una dependencia nueva, `verified_claims`, hace `check_token` sin tocar la base, igual que ahora `request_context`. La unidad recibe los claims ya verificados.
- **Una pieza genérica y reutilizable** en `dependencies.py`:
  ```python
  def authenticated_unit(settings, claims, build: Callable[[Connection, RequestContext], T])
      -> ContextManager[tuple[RequestContext, T]]
  ```
  - **Modo `supabase`:** `identity_transaction` → `Authenticate(...).admit(claims)` sobre esa conexión → `build(conn, context)`.
  - **Modo `dev`:** `study_transaction` con el contexto ficticio, como ahora.
  - Un `StudyError` se traduce con `study_http_error`, así que las respuestas 401 y 403 no cambian.

  Migrar otro endpoint después consiste en darle su `build`.
- **El dominio no se toca.** `Authenticate.admit` sigue igual. Cambian la infraestructura (`db.py`, `postgres_members.py`) y la composición (`dependencies.py`, la ruta).

## Slices: un PR, un commit por slice

Cada commit lleva su test en rojo y el código que lo pone en verde, y deja todo en verde. Se pueden revisar en orden, commit a commit.

### Slice 1: contador de sentencias (solo tests)

- `backend/tests/support/statements.py` cuenta los mensajes que el cliente envía a Postgres (Query y Parse/Execute) durante una petición. Primero se intenta con el trace de libpq (`conn.pgconn.trace`) activado desde el `configure` del pool. Si no da cuentas fiables, se usa `log_statement=all` en el Postgres de tests con un marcador por petición.
- Test de caracterización en `backend/tests/api/test_request_round_trips_postgres.py`: `GET /api/projects/{code}` en modo `supabase` (verificador real con claves generadas, miembro sembrado) envía **12** sentencias. Fija el punto de partida y cada slice siguiente baja ese número en el test.
- **Revisión:** que el contador cuente lo que debe. El test incluye un caso de control con una conexión que ejecuta 3 sentencias conocidas.

### Slice 2: fijar el estudio en la misma consulta que resuelve (12 → 11, global)

- `PostgresMemberResolver.resolve` pasa a ser una sola consulta: `SELECT …, set_config('app.study_id', study_id::text, true) FROM resolve_member(%s, %s)`.
- Tests de infraestructura con Postgres real:
  - después de `resolve`, `current_setting('app.study_id')` es el estudio de la persona;
  - si no hay invitación, el estudio queda sin fijar y no se ve ninguna fila;
  - los tests actuales del resolver siguen como están.
- **Afecta a todas las peticiones autenticadas**, que ahorran una sentencia. El comportamiento no cambia.

### Slice 3: la unidad autenticada y el endpoint piloto (11 → 6)

- `dependencies.py`: `verified_claims`, `authenticated_unit` y `authenticated_portfolio_unit_of_work`, con `build = lambda conn, ctx: PortfolioQueries(PostgresProjects(conn))`.
- `opportunity_routes.py`: `get_project` usa la unidad nueva y deja de depender de `Context` y `ReadUnit`. `get_portfolio` no se toca.
- Tests de API contra Postgres real:
  - **Rendimiento:** el contador baja de 11 a 6.
  - **RLS:**
    - con un token de una persona del estudio A, un proyecto de B da 404;
    - dentro de la unidad, `current_user` es `rgb_app` y `app.study_id` es el estudio A.
  - **Errores:**
    - 403 `not_invited`, 403 `member_revoked`, 403 `mfa_required`;
    - 404 si el proyecto no existe;
    - 200 con el mismo cuerpo que ahora.
  - **Sin conexión con un token malo:** se amplía `test_auth_connection.py` para que recorra los mismos tokens malos también contra `/api/projects/X`. Es una ampliación: los casos actuales no se modifican.
  - **El `COMMIT` antes de la respuesta:** si el `COMMIT` falla (se simula), la respuesta es 500, nunca 200.
  - **Modo `dev`:** el endpoint responde igual que antes.
- **Revisión:** este es el commit importante.

### Slice 4: la activación se confirma aunque el endpoint falle

- Hoy la activación (de invitada a activa, con su auditoría) va en su propia transacción y queda guardada aunque el endpoint falle después. Con una sola transacción, un 404 la desharía.
- **Decisión:** si `resolve_member` informa de que ha activado a la persona, la unidad hace `COMMIT` en ese momento y vuelve a fijar rol y estudio, porque `SET LOCAL` no sobrevive al `COMMIT`. Solo ocurre en el primer acceso de cada persona.
- **Implementación:** el adaptador deja en un atributo si la última resolución activó a alguien, y la unidad lo consulta. `Authenticate` no cambia.
- **Test:** una persona invitada pide un proyecto que no existe. Recibe 404, pero queda `active` y con su evento `activate` en `audit_events`. Además, una persona ya activa no provoca un `COMMIT` extra (el contador sigue en 6).

### Slice 5: comprobar la conexión del pool solo si lleva un rato parada (6 → 5, global)

- `db.py` sustituye `check=ConnectionPool.check_connection` por una función que se salta la comprobación si la conexión volvió al pool hace menos de 30 s. La hora de devolución se anota con el `reset` del pool. Las conexiones ya se cierran a los 60 s de inactividad y se renuevan a los 10 min.
- **Tests:**
  - una conexión devuelta hace menos de 30 s no se comprueba (el contador baja a 5);
  - una conexión con más tiempo se comprueba;
  - una conexión cerrada por el servidor antes de reutilizarla (`pg_terminate_backend`) no provoca un 500: el pool la descarta y entrega otra.
- **Afecta a todas las peticiones**, que ahorran una sentencia.

## Riesgos

| Riesgo | Cómo se cubre |
|---|---|
| Que el endpoint vea datos de otro estudio | Rol y estudio se fijan con `SET LOCAL` y `set_config(…, true)` dentro de la transacción, antes de la consulta. Lo cubren los tests de RLS del slice 3, y los tests de RLS actuales siguen sin tocarse. |
| Perder una activación | Slice 4. |
| Responder 200 con un `COMMIT` fallido | El `COMMIT` va dentro de la ruta; lo cubre el test del slice 3. |
| Usar una conexión muerta sin comprobarla | Solo se salta la comprobación si se usó hace menos de 30 s; lo cubre el test del slice 5. |
| Que dos formas de abrir transacción convivan sin que se note | Es temporal. La tarea de migrar el resto elimina `request_context` con su transacción propia. Se anota en el log. |

## Verificación

- `ruff check backend` y `pytest backend` en verde, integración incluida.
- **Producción, tras el merge y el despliegue:** 20 peticiones a `GET /api/projects/{code}` con una sesión real (solo lecturas). Se compara la mediana de los logs de Cloud Run con los 240 ms medidos. Criterio: ≤ 120 ms.
- Se anota en `implementation_log.md`: sentencias por slice, latencias y cualquier desviación del plan.

## Archivos

- `backend/app/shared/db.py` (slice 5)
- `backend/app/study/infrastructure/postgres_members.py` (slices 2 y 4)
- `backend/app/api/dependencies.py` (slices 3 y 4)
- `backend/app/api/opportunity_routes.py` (slice 3, solo `get_project`)
- `backend/tests/support/statements.py` (nuevo, slice 1)
- `backend/tests/api/test_request_round_trips_postgres.py` (nuevo)
- `backend/tests/api/test_auth_connection.py` (ampliado)
- Tests del resolver y de `db.py`
- `docs/estado.md`, `docs/plans/RGB-55/implementation_log.md`

## Después

Una tarea nueva migra el resto de endpoints a `authenticated_unit` (las 26 fábricas `*_unit_of_work`) y elimina la transacción propia de `request_context`.
