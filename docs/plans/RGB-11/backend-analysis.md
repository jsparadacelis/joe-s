# RGB-11 · Cartera del estudio: análisis del backend

Estado: propuesta, sin código (2026-10-24). Solo análisis: no hay migraciones, tests ni código de producción en este PR.

Verificado en el código de `main` (commit `3d88c1c`), en `docs/` y en el contrato del front (`docs/plans/RGB-11/{plan,contract}.md` y `frontend/lib/portfolio.ts` de la rama `feat/RGB-11-portfolio`; el `contract.md` y `portfolio.ts` solo están en el árbol de trabajo de esa rama, sin commitear, por lo que esta propuesta se contrasta con ellos tal como estaban al leerlos). **No he podido consultar el Backlog de Notion**: lo que digo sobre a qué tarea pertenece cada hueco sale de `docs/arquitectura.md`, `docs/estado.md` y los planes del repo, y está marcado «no verificado en Notion» donde es una inferencia.

## Resumen de hallazgos

1. **Hoy nada escribe en `projects`.** Ningún código de `backend/app` hace `INSERT INTO projects`; el único `UPDATE projects` es `change_phase` (RGB-9). Nada escribe `responsible_id`, `next_milestone`, `traffic_light`, `paused` ni `active`, y nada toca `internal_milestones`. Una `GET /api/portfolio` correcta devolvería una cartera vacía en cualquier base real hasta que exista el alta/edición de la ficha (RGB-19 u otra; no verificado en Notion).
2. De los 8 campos de la fila, **3 existen y son fiables** (código, nombre, fase), **3 existen pero son datos «a mano» sin escritor** (semáforo, en pausa, responsable como id), **1 existe con otra forma** (próximo hito) y **2 faltan** (bloqueo, última actualización de la ficha).
3. **El semáforo automático de RGB-22 no se puede calcular en servidor**: RGB-20 son funciones puras y faltan tres entradas por proyecto: tramos de pausa (RGB-21), semanas del plan del proyecto (tipología y escala por proyecto, RGB-16; `projects` no guarda `project_type` ni `scale`) y la fecha de entrada en cada fase (esta sí sale de `promotions`, pero solo de las promociones; la entrada en la fase 0 sale de `created_at`).
4. Se puede entregar ya un **`GET /api/portfolio` honesto y de solo lectura**, con degradación explícita (`status: "unknown"`, `blocker: null`, `owner_name: null`), que el front ya puede consumir con cambios pequeños y señalados abajo.

## 1. Campo a campo

| Campo de la cartera | ¿Existe hoy? | Dónde / cómo | Qué falta y a qué tarea pertenece |
| --- | --- | --- | --- |
| Código | Sí | `projects.code` (único por estudio) | — |
| Nombre | Sí | `projects.name` | — |
| Fase actual | Sí | `projects.current_phase` (FK a `phase_config`); nombre en `phase_config.name`. Cambia solo por `PromotionService` | — |
| Estado: semáforo | Parcial | `projects.traffic_light` (`green`/`amber`/`red`, nullable). Es un valor **almacenado**, sin escritor. RGB-22 define el semáforo como **calculado** por consumo (ámbar ≥ 80 %, rojo > 100 %) | Cálculo automático = RGB-20 (hecha, puro) + RGB-21 (pausas, persistencia y ruta; sin hacer) + RGB-16 (plan por proyecto; sin hacer). Ver sección 2 |
| Estado: «en pausa» | Parcial | `projects.paused boolean` (sin escritor). No hay tabla de pausas | Tabla de pausas y reanudación = RGB-21. Hasta entonces `paused` solo podría sembrarse a mano |
| Estado: «sin plan» | Sí, derivable | `current_phase = 0` (el plan cubre las fases 1 a 7, `time_tracking.py`) | — |
| Próximo hito (nombre) | Parcial, dos fuentes | `projects.next_milestone text` (sin fecha; la regla «activo» lo exige) y `internal_milestones` (`name`, `due_date date` nullable, `completed_at`, `phase`; nadie escribe en ella) | Alta y edición de hitos: sin tarea identificada en el repo (no verificado en Notion; plausible RGB-19 «ficha» o RGB-12). Decisión abierta: cuál es la fuente de verdad (pregunta 2) |
| Próximo hito (fecha) | Parcial | `internal_milestones.due_date` (puede ser NULL). `projects.next_milestone` no tiene fecha | Igual que arriba. Sin fecha el hito no cuenta en «Hitos en 7 días» |
| Responsable | Parcial | `projects.responsible_id text`: un **identificador** opaco. No hay tabla de usuarios; `RequestContext.user_id` es texto libre y los roles/habilitaciones son de RGB-4 (sin hacer) | Nombre visible = RGB-4 (usuarios). Asignación del responsable = ficha (RGB-19, no verificado). Hasta entonces, el front recibe el id |
| Bloqueo | **Falta** | No hay columna ni tabla | Migración nueva, ver abajo. Quién lo escribe: ficha/seguimiento (no verificado en Notion; no hay tarea clara en el repo) |
| Días sin actualizar la ficha | **Falta** (solo proxy) | `projects.updated_at` existe pero solo lo toca `change_phase`; `exit_deliverables.updated_at` tiene `DEFAULT now()` y no hay disparador ni código que lo actualice. `audit_events` solo contiene promociones/ajustes del plan | Marca real de «última edición de la ficha» = la tarea que edite la ficha (RGB-19, no verificado). Migración mínima propuesta abajo |
| Resumen: activos | Parcial | `projects.active` existe pero choca con las oportunidades (ver riesgo R1) | Definir «activo» (pregunta 1) |
| Resumen: en riesgo | Derivable | Cuenta `amber`/`red` de la columna `status` | Fiable solo cuando el semáforo sea real |
| Resumen: hitos en 7 días | Derivable | `next_milestone.date` entre hoy y hoy + 7 (incluidos) | Depende de que haya fechas |
| Resumen: desactualizadas | Derivable | `days_since_update > 7` | Depende de la marca de actualización |

### Migraciones que harían falta

Siguiente número libre: `006`. Todas deben cumplir la regla de oro del repo: `study_id`, `protect_study_table` (RLS forzada + política `study_isolation`) y `tables_without_rls()` vacía. Las columnas nuevas en `projects` heredan su RLS, no necesitan política propia.

**006a · Bloqueo** (propuesta; la tabla alternativa solo si se quiere historial):

```sql
ALTER TABLE projects ADD COLUMN blocker text
    CHECK (blocker IS NULL OR btrim(blocker) <> '');
```

- Tipo `text` nullable; `NULL` = sin bloqueo. RLS: heredada de `projects`.
- Auditoría: quien edite el bloqueo (caso de uso futuro) debe escribir `audit_events` con `entity='project'`, `action='set_blocker'`, `old_value`/`new_value`, en la misma transacción. La lectura de la cartera no audita.
- Alternativa más cara (tabla `project_blockers` con inicio/fin, solo inserción) solo si el PRD pide historial de bloqueos. No verificado.

**006b · Última edición de la ficha** (dos opciones; recomiendo A + el disparador):

- A. Columna `projects.sheet_updated_at timestamptz NOT NULL DEFAULT now()`, que actualizan los casos de uso que editen la ficha (RGB-19). Explícita y sin magia.
- B. Disparador `BEFORE UPDATE` genérico que ponga `updated_at = now()` en `projects` y `exit_deliverables`, para que `updated_at` deje de depender de que cada UPDATE se acuerde. Cambia el significado de `updated_at` (también se movería con `change_phase`, lo que es coherente con «la ficha cambió»).
- Con ninguna de las dos, `days_since_update` es solo «días desde que el proyecto se creó o cambió de fase», no desde que se editó la ficha. Eso sería un dato engañoso, no un `null`, así que lo declaro (ver 3).

**No hace falta** migración para el hito si se usa `internal_milestones`; sí una decisión (pregunta 2). **No hace falta** tabla de usuarios aún; sí cuando RGB-4 llegue, para `owner_name`.

## 2. Cómo se calcularía el estado

Valores posibles en la API: `green`, `amber`, `red`, `paused`, `no_plan`, `unknown` (nuevo).

Regla propuesta, en este orden, sobre una función pura de dominio:

1. `current_phase = 0` → `no_plan` (invariante del front: `no-plan` si y solo si fase 0).
2. `paused = true` → `paused`.
3. `traffic_light` no nulo → ese valor (**es el valor almacenado, no calculado**).
4. Si no → `unknown`.

Qué se puede dar hoy y qué no:

| Pieza | Hoy | Bloqueado por |
| --- | --- | --- |
| `no_plan` (fase 0) | Fiable | — |
| `paused` | Solo el booleano; nadie lo escribe, así que casi siempre `false` | RGB-21 |
| Semáforo calculado (consumo del plan) | **No** | RGB-16 (semanas del plan por proyecto), RGB-21 (pausas) |
| Semáforo almacenado | Existe la columna; sin escritor | Quién lo fija y con qué regla (pregunta 3) |

Por qué no calcularlo con RGB-20 ahora: `summarize_time` necesita `plan_weeks` (7 enteros) y `pause_spans`. El plan de un proyecto sale de `make_plan(project_type, scale)` pero `projects` no guarda ni tipo ni escala, y no hay tabla de pausas. Inventar un plan por defecto o asumir «sin pausas» daría semáforos falsos que además alimentan «En riesgo». Se descarta.

Degradación honesta:

- `status: "unknown"` cuando hay fase ≥ 1, no hay pausa y no hay semáforo almacenado. El resumen **no cuenta** `unknown` como en riesgo y el front debe mostrarlo como «Sin calcular» (tono `off`), no como verde.
- Mientras `paused` no tenga escritor, la cartera no puede asegurar que un proyecto no esté en pausa: documentarlo en el plan de RGB-21 y en el aviso de la pantalla si se quiere (pregunta al usuario).
- Cuando exista RGB-21, se añade un puerto `TimingReader` al caso de uso y el estado pasa a calcularse con `summarize_time` + umbrales de RGB-22 (ámbar ≥ 80 % del plan de la fase actual, rojo > 100 %, con enteros). El contrato de la API **no cambia**; solo deja de salir `unknown`. Eso es lo que justifica fijar el contrato ahora.

## 3. Contrato propuesto: `GET /api/portfolio`

Estilo de las rutas existentes (`/api/plan`, `/api/settings/plan`): claves **snake_case** en la API, y el cliente del front las convierte a camelCase (precedente: `fetchPlanSettings` en `frontend/lib/plan-settings.ts` mapea `scale_factors` → `scaleFactors`). Errores como el resto: `{"detail": {"code", "message"}}` con mensaje en español.

Autenticación: ninguna por ahora; `request_context` entrega el contexto de desarrollo (RGB-2). Sin parámetros en esta primera versión (filtros y resumen los sigue haciendo el front; ver decisión abajo).

```json
{
  "as_of": "2026-10-24",
  "projects": [
    {
      "code": "PRY-EJ-001",
      "name": "Vivienda unifamiliar (ejemplo)",
      "phase": 3,
      "phase_name": "Anteproyecto",
      "status": "green",
      "next_milestone": { "name": "Entrega del anteproyecto", "date": "2026-10-28" },
      "owner_id": "sample-user-ana",
      "owner_name": null,
      "blocker": null,
      "days_since_update": 2
    }
  ]
}
```

Notas de campo:

- `as_of`: fecha de hoy en `Europe/Madrid` (misma zona que fijó RGB-20 para las fechas). Es la fecha con la que se calculó `days_since_update`; el front puede usarla como `today` del resumen en vez de la del navegador, así los «hitos en 7 días» no dependen del reloj del cliente.
- `status`: `green | amber | red | paused | no_plan | unknown`.
- `next_milestone`: `null` o `{name, date}`; `date` ISO `yyyy-mm-dd` **o `null`** si el hito viene de `projects.next_milestone` (texto sin fecha).
- `days_since_update`: entero ≥ 0, calculado en servidor con `as_of`.
- Orden: por `code` ascendente (estable y testeable; el front no ordena columnas).
- Errores: `500` solo por fallo de base; no hay 404 (cartera vacía = `{"as_of": ..., "projects": []}`).
- Sin `summary` en la respuesta: el front ya tiene `summarizePortfolio` probada y duplicar la regla en dos sitios es el mayor riesgo de incoherencia. Si más adelante se pagina o se filtra en servidor, entonces sí (cambio aditivo).

### Diferencias con `frontend/lib/portfolio.ts` (lo que tendría que cambiar el front)

| Front hoy | API propuesta | Cambio en el front |
| --- | --- | --- |
| camelCase | snake_case | El cliente `fetchPortfolio` mapea (como `plan-settings.ts`) |
| `status: "no-plan"` | `"no_plan"` | Mapear en el cliente (`no_plan` → `no-plan`) o unificar a guion bajo |
| 5 estados | + `"unknown"` | Añadir `"unknown"` a `PortfolioStatus`, etiqueta «Sin calcular», tono `off`, opción en el filtro; el resumen no lo cuenta como riesgo |
| `owner: string` | `owner_id` + `owner_name` (null hoy) | Mostrar `owner_name ?? owner_id`; filtrar por `owner_id`. Si se prefiere no tocar el front, la API puede mandar `owner` = `owner_name ?? owner_id` (menos limpio; recomiendo los dos campos) |
| `nextMilestone: {name, date}` | `date` puede ser `null` | `date: string \| null`; «Sin fecha» en la celda; no cuenta en «Hitos en 7 días» |
| — | `as_of`, `phase_name` | Opcional: usar `as_of` como `today`; `phase_name` ya está en `lib/phases.ts` |
| `fetchPortfolio(): PortfolioRow[]` | objeto `{as_of, projects}` | El cliente devuelve las filas y, si se quiere, `as_of` |
| Invariante «phase 0 ⇔ no-plan» | Igual | Sin cambio |
| «La cartera solo contiene proyectos activos» (contrato) | Ver R1 | Pendiente de la pregunta 1 |

## 4. Diseño DDD / TDD

### Contexto y capas

Contexto nuevo **`portfolio`** (modelo de lectura; `docs/arquitectura.md` lista RGB-11 bajo `lifecycle`, pero la cartera solo lee y mezcla datos de `lifecycle`, hitos y, luego, `timing`; un contexto propio evita que `lifecycle` dependa de `timing`. Si se prefiere seguir la tabla de arquitectura al pie de la letra, vive en `lifecycle`; es decisión de forma, no de comportamiento). Los contextos «se comunican por identificadores», así que el adaptador lee tablas por SQL y no importa entidades de otros contextos.

```
backend/app/portfolio/
  domain/
    status.py        # ProjectStatus (enum), derive_status(phase, paused, traffic_light)
    entry.py         # PortfolioEntry, NextMilestone (dataclasses congeladas)
    ports.py         # PortfolioReader (Protocol), Clock (Protocol)
  application/
    get_portfolio.py # GetPortfolio: lee, deriva estado y días, ordena
  infrastructure/
    postgres_portfolio.py  # PostgresPortfolioReader(conn)
backend/app/api/portfolio_routes.py   # GET /api/portfolio
backend/app/api/dependencies.py       # + portfolio_unit_of_work
backend/app/api/main.py               # + include_router
```

`Clock` (hoy en Madrid) es un puerto para fijar `as_of` en tests; no existe todavía un reloj en `shared/` (sin verificar uso en otros servicios: `config.py` y `db.py` no lo tienen), se crea aquí.

### Puertos

- `PortfolioReader.list_records() -> list[ProjectRecord]`: una fila cruda por proyecto con `code, name, phase, phase_name, paused, traffic_light, responsible_id, next_milestone_text, milestone_name, milestone_date, blocker, last_updated_at`. Sin lógica.
- `Clock.today() -> date`.
- (Futuro, RGB-21) `TimingReader.time_inputs(project_id)`.

### Caso de uso

`GetPortfolio.execute() -> Portfolio` (`as_of`, `entries`): llama al lector, aplica `derive_status`, `days_since_update = (as_of - last_updated_at en Madrid).days` con suelo 0, resuelve el hito (ver abajo) y ordena por código. Sin escrituras ni auditoría.

### Adaptador Postgres

Una sola consulta dentro de `study_transaction` (rol `rgb_app` + `app.study_id`), por lo que **la RLS aplica sola** y no se añade `WHERE study_id`. Esquema:

```sql
SELECT p.code, p.name, p.current_phase, pc.name, p.paused, p.traffic_light,
       p.responsible_id, p.next_milestone, p.blocker, m.name, m.due_date,
       GREATEST(p.updated_at, ...) AS last_updated_at
FROM projects p
JOIN phase_config pc ON pc.id = p.current_phase
LEFT JOIN LATERAL (
    SELECT name, due_date FROM internal_milestones
    WHERE project_id = p.id AND completed_at IS NULL
    ORDER BY due_date NULLS LAST, name LIMIT 1
) m ON true
WHERE NOT EXISTS (SELECT 1 FROM promotions x WHERE x.project_id = p.id
                  AND x.action = 'do_not_pursue' AND x.outcome = 'ok')
ORDER BY p.code
```

(`internal_milestones` no lleva índice por `project_id`; con pocos hitos por proyecto no importa, pero un índice `(project_id, due_date)` entra en la migración si hay medición.) La consulta de arriba es un boceto; los nombres de columna del bloqueo y de la marca de actualización dependen de 006a/006b.

Regla de hito: si hay un hito sin completar en `internal_milestones` → ese. Si no y `projects.next_milestone` tiene texto → `{name: texto, date: null}`. Si no → `null`. (Pregunta 2: puede que se prefiera una sola fuente.)

### Lista ordenada de tests (rojo → verde → refactor)

Dominio (puros):
1. `derive_status` fase 0 → `no_plan`, aunque haya semáforo o pausa.
2. `derive_status` pausado en fase ≥ 1 → `paused`, aunque haya semáforo.
3. `derive_status` con semáforo y sin pausa → ese color (tres casos).
4. `derive_status` sin semáforo, fase ≥ 1, sin pausa → `unknown`.
5. `days_since_update`: mismo día → 0; ayer → 1; hora tardía de UTC que ya es otro día en Madrid; fecha futura (reloj desfasado) → 0.
6. Resolución de hito: gana el hito de `internal_milestones`; cae al texto sin fecha; ninguno → `None`.

Aplicación (puertos con `create_autospec`, reloj fijo):
7. Cartera vacía → `as_of` y lista vacía, sin error.
8. Devuelve ordenado por código, con estado y días derivados.
9. Usa `Clock.today()` como `as_of` y lo pasa a todos los cálculos.
10. No escribe: el lector solo expone lectura y el caso de uso no toca `AuditLog` (comprobar con autospec sin llamadas).

Infraestructura (Postgres real, patrón de `test_promotion_postgres.py`):
11. Lee un proyecto con todos los campos y el nombre de la fase desde `phase_config`.
12. Elige el hito sin completar más cercano; ignora los completados; `due_date NULL` va al final.
13. Excluye proyectos descartados (`do_not_pursue` con `outcome='ok'`) pero no los rechazados.
14. **RLS:** el estudio A no ve proyectos ni hitos del B (mismo patrón que `tests/shared/test_rls.py`).
15. `bloqueo` y marca de actualización leídos tal cual (tras 006a/006b).
16. Si 006b es el disparador: un UPDATE de `projects` mueve `updated_at`.

API (`TestClient`, caso de uso simulado):
17. `GET /api/portfolio` → 200 con la forma exacta del contrato (snake_case, `status` en el vocabulario, `date` nullable).
18. Cartera vacía → 200 con `projects: []`.
19. Fallo inesperado → no se filtra detalle interno (mensaje en español, mismo formato `detail`).
20. Test de arquitectura existente sigue en verde (`portfolio.domain` sin FastAPI/psycopg); añadir caso que impida a `portfolio` importar `PromotionService`.

Más: `test_schema.py` y `tables_without_rls()` siguen vacíos tras 006.

## 5. Riesgos, preguntas y alcance entregable

### Riesgos

- **R1 · «Activo» no encaja con «sin plan».** La restricción `active_requires_data` exige `traffic_light` para `active = true`, pero el front dice que la cartera solo contiene proyectos activos y que las oportunidades (fase 0) no tienen semáforo (`no-plan`). Una oportunidad no puede estar `active` sin semáforo. Filtrar por `active` dejaría fuera las oportunidades; no filtrar mete descartados y cerrados. Propongo filtrar por «no descartado» (sección 4) y no por `active`, pendiente de confirmar.
- **R2 · Cartera vacía en producción** hasta que exista el alta de proyectos y la edición de ficha (hallazgo 1). Las pruebas en Supabase necesitan semillas de desarrollo (hay `seed_dev.py` solo para el estudio; habría que sembrar proyectos ficticios `PRY-EJ-00N`, no reales).
- **R3 · Datos engañosos por defecto:** días sin actualizar basados en `updated_at` serían un proxy; verde por defecto sería peor que `unknown`. Mitigado con `unknown` y con 006b.
- **R4 · Descartados y cerrados:** `do_not_pursue` solo inserta en `promotions` (RGB-9 lo deja a RGB-16); no hay estado «cerrado» más allá de la fase 7. La cartera mostraría proyectos en fase 7 para siempre.
- **R5 · Zona horaria:** `as_of` y `days_since_update` en `Europe/Madrid`; el front hoy usa la fecha del navegador. Pueden diferir cerca de medianoche si no usa `as_of`.
- **R6 · Dos fuentes de próximo hito** (`projects.next_milestone` y `internal_milestones`) pueden contradecirse.
- **R7 · Dependencias cruzadas:** RGB-23 (semanas y pausas en la cartera) necesita RGB-21; el contrato aditivo evita rehacer la ruta.
- No he podido verificar: criterios de aceptación del backend en la página RGB-11 de Notion, ni qué tarea posee el alta de proyectos, el bloqueo y el responsable.

### Preguntas abiertas para el usuario

1. **¿Qué proyectos entran en la cartera?** `active = true` (obliga a tener semáforo, deja fuera las oportunidades), o todos salvo los descartados (y, ¿se ocultan los de fase 7/cerrados?).
2. **¿Cuál es la fuente del próximo hito?** `internal_milestones` (con fecha, por fase) o el texto `projects.next_milestone` (sin fecha). ¿Se unifica y se quita una?
3. **¿El semáforo es calculado (RGB-22: consumo del plan) o fijado a mano?** Si es calculado, la cartera mostrará «Sin calcular» hasta RGB-16 + RGB-21; si hay que mostrar algo antes, hay que decidir quién escribe `traffic_light`.
4. ¿Qué tarea crea proyectos y edita la ficha (responsable, bloqueo, última edición)? Condiciona 006a/006b.
5. ¿Aceptas `unknown` («Sin calcular») como sexto estado y `owner_id` + `owner_name` como forma del responsable hasta RGB-4?

### Qué se puede entregar ya y qué no

| Parte | ¿Ya? | Condición |
| --- | --- | --- |
| Ruta `GET /api/portfolio`, contrato, contexto `portfolio`, RLS, ordenación | **Sí** | Respuestas a 1 y 2 |
| Código, nombre, fase, `no_plan`, hito (si hay datos), `days_since_update` aproximado | **Sí**, con las salvedades de arriba | 006b si se quiere fiable |
| Bloqueo | Columna + lectura sí; **valor útil no** | 006a y alguien que lo escriba |
| Responsable con nombre | Solo id | RGB-4 |
| Semáforo calculado y «en pausa» reales | **No** | RGB-16, RGB-21 |
| Cartera con datos reales (no vacía) | **No** | Alta de proyectos / ficha (RGB-19, no verificado) |
| Conectar el front y quitar los datos de ejemplo | Posible tras la ruta, con los cambios de la sección 3 | — |

Estimación honesta: la ruta y el caso de uso son una tarea pequeña-media (≈ 20 tests, una migración de 2 líneas más el disparador); lo que hace útil la pantalla (datos reales, semáforo real, pausas) depende de otras tareas, por lo que RGB-11 se puede cerrar **como esqueleto honesto** (con `unknown`) pero no «con todos los datos» hasta que esas tareas estén hechas.
