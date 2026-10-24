# RGB-21 · Registro de implementación

Pausas con motivo, fecha prevista y reanudación (full-stack). Contrato: [contract.md](contract.md), sin cambios. Detalle de cada frente: [backend-log.md](backend-log.md) y [front-log.md](front-log.md).

## Cómo se hizo (con honestidad)

- **Ningún frente usó subagentes anidados.** El frente back y el frente front trabajaron en paralelo, cada uno en su rama y en una sola sesión, y los roles (Escritor de tests, Desarrollador, Tester) se hicieron en secuencia dentro de esa sesión. Los tests se escribieron antes del código (rojo, verde), pero sin agentes separados. El Juez (agente independiente) revisó la rama integrada y la aprobó sin bloqueantes; ejecutó él mismo `ruff`, `pytest backend` (658) y el front (1345).
- El front se probó solo contra un servidor falso; la integración es la primera vez que los dos lados se ven.

## Frente back (`feat/RGB-21-back`)

Migración `007_pauses.sql` (tabla `pauses`, una única pausa abierta por proyecto, RLS), contexto `timing` (dominio puro, `PauseService`, `PostgresPauses`), rutas `POST /api/projects/{code}/pause`, `POST .../resume`, `GET .../pauses` y el campo aditivo `pause` de `GET /api/portfolio`. Auditoría de pausar, reanudar y rechazos por permiso. 658 tests.

## Frente front (`feat/RGB-21-front`)

`lib/pauses.ts`, `PauseManager` en «Plan y tiempos» de un proyecto real (panel «Pausa activa», «Reanudar» con confirmación, formulario «Pausar proyecto», historial), chip «En pausa» con «Reanudación prevista el …» y «Vencida hace N días» en la cartera. 1344 tests.

## Integración

- Fusión de las dos ramas sobre `feat/RGB-21`: **sin conflictos**.
- Una discrepancia, de texto. El contrato dejó abierto el mensaje de una fecha mal escrita. El back responde «debe ser una fecha con formato aaaa-mm-dd» cuando el texto no tiene la forma `aaaa-mm-dd` y «no es una fecha existente» solo cuando la forma es correcta pero el día no existe (2026-02-30). El front decía «no es una fecha existente» para ambos casos. Mandan los del back: test en rojo en `__tests__/lib/pauses.test.ts` y corrección en `validatePause` (`lib/pauses.ts`). Con el selector de fecha del navegador esa rama casi no se alcanza, pero la validación y la API dicen ya lo mismo.
- Revisado y coincidente, sin cambios:
  - Mapeo de motivos: el front envía `client_wait` y muestra «Espera del cliente»; un motivo desconocido se mostraría como «Otra» (la API real no lo devuelve).
  - Textos reales de 403, 409 y 422: se muestran tal cual los envía la API, en español, junto a la acción o al campo.
  - «Hoy» es UTC en los dos lados (`todayUtc` en el front, el reloj UTC en el back); el campo de fecha lleva `min` con la fecha UTC. Cerca de medianoche UTC el servidor manda, y su mensaje se muestra.
  - `pause: null` con `status: paused` (dato heredado): el front muestra solo el chip «En pausa».
- Verificado: `ruff check backend` limpio, `pytest backend` 658 en verde (Postgres local `back-db-1`), en frontend `lint`, `typecheck`, `test` (1345 tests) y `build` en verde.

## Prueba de punta a punta (API real, build real, Playwright `es-ES`, claro y oscuro, axe)

Migraciones aplicadas a la base local; uvicorn con `DEV_ROLE=project_director` (8000, el que usa el front con `NEXT_PUBLIC_API_URL=http://localhost:8000`), otro con `partner` (8001, solo para promover, porque promover desde la fase 0 exige partner o director) y, durante los pasos de 403, el de 8000 se sustituye por uno con `DEV_ROLE=architect`. La base se limpió antes de cada pasada (claro y oscuro). 104 comprobaciones en verde y axe sin violaciones en cada estado:

1. Alta de la oportunidad desde el formulario (RGB-13): aparece en la cartera con «Sin plan hasta promover». «Plan y tiempos» de la fase 0 no tiene botones; la API responde 422 `cannot_pause_opportunity` si se fuerza.
2. Promoción a la fase 1: no hay ruta para aprobar el entregable de salida de la fase 0, así que se insertó la fila de `exit_deliverables` completa y aprobada por SQL **solo en la base local** y se promovió por la API (200, fase 1).
3. «Plan y tiempos» del proyecto real: «Sin calcular», sin pausa, historial vacío.
4. «Pausar proyecto»: errores de cliente (campos vacíos; fecha anterior a hoy); 422 reales del servidor junto al campo, provocados alterando el cuerpo de la petición en el navegador (fecha 2026-02-30 → «no es una fecha existente»; motivo `client-wait` → «no es un motivo admitido»), con foco en el campo; API caída (petición abortada) → «No se pudo conectar con el servidor» y datos conservados; 403 real con el proceso `architect` → «Solo el director de proyecto o la dirección pueden pausar o reanudar.».
5. Pausa válida (espera del cliente, 09/11/2026): panel «Pausa activa» con foco en el encabezado; la API guarda `client_wait`, fase 1.
6. Cartera: «En pausa» y «Reanudación prevista el 09/11/2026».
7. 409 real al pausar dos veces (pestaña desactualizada): «El proyecto ya está en pausa.» y no se crea otra fila.
8. Pausa vencida: se desplazaron las fechas con SQL en la base local (inicio hace 20 días y reanudación prevista hace 4 días, `update pauses … current_date - 4`); cartera y panel muestran «Vencida hace 4 días» en texto.
9. 403 real al reanudar con el rol `architect`.
10. «Reanudar» con confirmación: la pausa pasa al historial, la API la devuelve cerrada y la cartera vuelve a la normalidad. 409 real al reanudar dos veces («El proyecto no está en pausa.»).
11. RGB-13 y los ejemplos: alta y cartera siguen bien, `/projects` lista el real y los `PRY-EJ-00N`; los `PRY-EJ-001` a `004` abren «Plan y tiempos» sin botones de pausa y `PRY-EJ-003` conserva su pausa de ejemplo; un código inexistente da 404.
- Cloud Run solo en lectura: `GET /api/portfolio` y `GET /api/projects/{code}/pauses` responden 404 (aún no tiene este back), como se esperaba. No se escribió nada.
- Limpieza: base local vaciada (proyectos, oportunidades, pausas, entregables, promociones y versiones congeladas) en una transacción única que desactiva y reactiva los triggers de solo inserción de `promotions` y `frozen_versions`, solo en local; `audit_events` no se tocó. Procesos parados.
- Pantallazos: [screenshots/](screenshots/) (`integration-*`, claro y oscuro, fechas en es-ES, con datos ficticios). Se eliminaron los `front-*` del servidor falso.

## Supuestos provisionales del plan (siguen vigentes)

1. «Dirección» = `director` y `partner`; la autoridad por rol real llega con RGB-2 y RGB-4.
2. Una oportunidad (fase 0) no se puede pausar; se puede desde la fase 1.
3. Fechas en UTC; la fecha prevista no puede ser anterior a hoy (sí hoy).
4. El aviso diario al director de proyecto queda fuera: no hay canal de avisos ni planificador. Se entrega el indicador «Vencida» con los días de retraso.
5. Sin plan base confirmado (RGB-16), las semanas de un proyecto real salen «Sin calcular».

## Seguimientos

- Aviso diario al director de proyecto cuando una pausa vence (canal de avisos y planificador).
- Ruta para completar y aprobar el entregable de salida de la fase 0 (hoy solo por SQL en local).
- Semanas planificadas de un proyecto real, sin RGB-16: «Sin calcular».
- Unificar el `Pause` de ejemplo de `lib/timing.ts` con `ProjectPause`.
- Pausa que cruza fases (el back guarda la fase de apertura) y el reloj activo con pausas reales (RGB-20/22) aún no se conectan.
- Dato heredado `projects.paused = true` sin fila en `pauses`: se muestra «En pausa» sin fecha, y no se puede reanudar (`not_paused`).
- Cartera: «Proyectos activos» cuenta los proyectos en pausa; decidir si deben contarse aparte.
- Sin pantalla para ver las pausas desde la cartera más allá del chip; el historial vive en «Plan y tiempos».

## Seguimientos del Juez

- Capturas del formulario con el campo de fecha nativo en formato EE. UU. (`11/09/2026` se lee como 11 de septiembre en español, es el 9 de noviembre): regenerarlas con Chromium en `--lang=es-ES`. No es un fallo de la app.
- `integration-form-error-server-422-*` muestra una fecha válida junto a «no es una fecha existente» porque el cuerpo se alteró a mano para provocar el 422 del servidor.
- **Aviso diario:** forma parte del alcance y del prompt de RGB-21 en Notion, aunque no de sus criterios. Queda fuera por falta de canal de avisos y de planificador: hay que crear una tarea aparte (canal + planificador) o reabrir el alcance.
- `portfolio/application/queries.py` importa `timing.domain.pause.days_past`: acoplamiento entre contextos declarado; llevarlo a `shared` si crece.
- «Proyectos activos» de la cartera cuenta también los proyectos en pausa; pausa que cruza fases con RGB-20/22.

## Qué hay que desplegar (acciones de la persona usuaria)

1. Aplicar la migración `007_pauses.sql` en Supabase (antes, que estén aplicadas la 004 a la 006 si no lo están).
2. Desplegar el backend en Cloud Run (hoy responde 404 en estas rutas y en `/api/portfolio`).
3. Desplegar el front en Vercel con `NEXT_PUBLIC_API_URL` apuntando a Cloud Run.
