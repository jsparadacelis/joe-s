# RGB-16 · Registro del Tester

Rama `feat/RGB-16-proposed-plan`. Verificación de punta a punta con API real y build real, solo en local (Postgres de docker `back-db-1`, puerto 54329; nada de Supabase, Cloud Run ni Vercel). Datos ficticios. El Tester no tocó código de producción. Veredicto del Juez: pendiente.

## Resultado en una línea

Primera pasada: un bloqueante (el front no podía cargar el plan porque `GET /api/plan` devuelve `weeks_by_phase` como objeto). El Desarrollador corrigió los hallazgos 1, 3 y 4; la segunda pasada, con build nuevo y API real, sin tocar ninguna respuesta, los da por **corregidos** y no encuentra fallos nuevos. Quedan abiertos como seguimientos los hallazgos 2, 5, 6, 7, 8, 9, 10, 11 y 12. Veredicto del Juez: pendiente.

## Ejecutado (segunda pasada)

- Back: `ruff check` y `ruff format --check` limpios (157 archivos). `pytest backend` con Postgres local y migraciones hasta la 009: **1085 passed**.
- Front: `lint` y `typecheck` limpios; `jest`: **70 suites, 1579 tests** en verde; `next build` en verde con `NEXT_PUBLIC_API_URL=http://localhost:8000`.
- Servidores locales: API uvicorn en el 8000 (el rol de desarrollo cambia por configuración: `partner` o `architect` para el 403; para el error de red se para el proceso) y `next start` en el 3010. Solo Postgres local de docker; datos ficticios. Todo parado al terminar.
- Playwright `es-ES`, claro y oscuro, con axe: 102 comprobaciones en verde por pasada; las únicas dos que fallan en cada tema son las de 360 px del hallazgo 8, que no es de este cambio.

## Reverificación pedida

- **(a) Flujo completo desde la pantalla:** elegir escala, plan propuesto (igual a `make_plan`), editar la primera semana, Promover, confirmar (doble clic: 1 POST), aviso de éxito con el foco en él (`role=status`), fase 1. En base: `project_plans` con la línea base editada (3,2,4,5,8,40,4), versión congelada 1 de la fase 0 con plan y scoring (nota 80,0), auditoría `project_plan/confirm` y `project/promote`, y `GET /api/projects/{code}/plan` devuelve lo confirmado. Al recargar ya no hay panel.
- **(b) No perseguir:** motivo vacío o en blanco, error junto al campo con foco; con motivo, aviso «Oportunidad descartada: no perseguir.» y un solo POST con doble clic.
- **(c) 403 en pantalla:** con el rol `architect`, «No tienes autoridad para esta acción en la fase 0. Pueden hacerlo: Socio, Director.» en la confirmación, con foco en la alerta y reintento posible; lo mismo en no perseguir; la fase sigue en 0.
- **(d) Confirmar con una semana inválida:** con la confirmación abierta y una semana a 0, no hay POST, aparece el error y el foco va al primer campo inválido (`aria-invalid`).
- **(e) axe** sin violaciones en claro y oscuro en: panel sin escala, con plan, error de semanas, confirmación, confirmación con semana inválida, éxito, motivo vacío, 403, sin scoring y móvil.
- Además: error de red en el POST y en la carga del plan (API parada), segunda pestaña (409), sin scoring (422), proyecto de ejemplo y proyecto sin oportunidad sin panel.

## Criterios y reglas

| Criterio / regla | Resultado |
|---|---|
| Solo socio o director promueven o descartan | OK. `partner` y `director` 200; `architect` y `project_director` 403 `no_authority` en `/start` y en `/do-not-pursue`, sin plan ni versión congelada creados, con rechazo auditado (`start`/`do_not_pursue`, `rejected`). El 403 gana a un cuerpo inválido. En pantalla: «No tienes autoridad para esta acción en la fase 0. Pueden hacerlo: Socio, Director.» dentro de la confirmación, con foco en la alerta y reintento posible. |
| Scoring y plan congelados | OK. `frozen_versions` (fase 0, versión 1) lleva `project`, `scoring` (ratings, pesos, umbral, nota, recomendación, versión) y `plan` (tipología, escala, semanas, total). Tras cambiar la plantilla industrial a 9 semanas, el factor medio a 1,5 y los pesos/umbral del scoring (presupuesto 9, umbral 90): el contenido congelado, la línea base, `GET /plan` y `GET /scoring` son idénticos byte a byte (md5 antes/después) y volver a puntuar da 409 `not_an_opportunity`. Ajustes restaurados al terminar. |
| Línea base inmutable | OK. Como dueño: UPDATE, DELETE y TRUNCATE sobre `project_plans` fallan con «project_plans is immutable: insert-only»; como `rgb_app`: «permission denied». Idem `frozen_versions`. |
| Aislamiento entre estudios | OK. Otro estudio recibe 404 `project_not_found` en `start`, `plan` y ficha de un código ajeno; los códigos son por estudio (`PRY-2026-001` existe en los dos y se promueven por separado); `rgb_app` sin contexto ve 0 filas y con el estudio B ve 0 de A. |
| Auditoría | OK. Por promoción: `project_plan/confirm` y `project/promote` (versión 1) con el mismo instante, y cada rechazo (`invalid_weeks`, `invalid_scale`, `no_authority`, 409) como `start`/`rejected`. |
| Ninguna acción de IA cambia el estado | OK. Cargar la página y elegir escala dos veces no emite ninguna petición que no sea GET; solo cambian de fase las acciones humanas. |
| Textos en español, código en inglés | OK en lo revisado (mensajes de la API y de la interfaz en español). |

## Hallazgos

Severidad: Bloqueante, Alta, Media, Baja, Info. Los de la primera pasada (API real: carreras con 12 POST, 422 de semanas y escala, inmutabilidad, congelado tras cambiar plantillas y pesos, aislamiento entre estudios) siguen vigentes y sin cambios en el back.

### Corregidos y reverificados

1. **Bloqueante, corregido.** `GET /api/plan` (y `/start`, `/plan`) devuelven `weeks_by_phase` como objeto y el front lo trataba como array, así que al elegir escala salía «Ocurrió un error inesperado.». Ahora `lib/start.ts` lo normaliza: con la API real el panel carga el plan, las siete semanas coinciden con `make_plan` y se puede promover. Histórico: no se conserva el pantallazo del fallo.
3. **Media/Baja, corregido.** Tras el éxito el foco va al aviso (`role=status`, `tabIndex=-1`); medido en las dos pasadas de tema.
4. **Baja, corregido.** «Confirmar promoción» revalida las semanas: con una a 0 no hay POST ni fila `rejected` en la auditoría, y el foco va al primer campo inválido.

### Seguimientos abiertos

2. **Media.** «No perseguir» no impide promover después: `do-not-pursue` deja la fase en 0 y un `/start` posterior promueve; en una carrera ganan los dos, y tras descartar y recargar el panel vuelve a ofrecer «Promover». Falta definir qué significa «descartada» (RGB-9/RGB-17).
5. **Baja.** Cambiar de escala descarta en silencio las semanas editadas.
6. **Baja.** Con el proyecto ya promovido, un rol sin autoridad recibe 409 en lugar de 403 (revela el estado).
7. **Baja.** `save_exit_content` sobrescribe y marca completo y aprobado un entregable de fase 0 preexistente; hoy no hay otra ruta que lo escriba.
8. **Info.** A 360 px todas las páginas del shell desbordan por la barra lateral fija de 232 px (plataforma de escritorio); scoring desborda más (656) por el formulario y el historial anteriores. El panel nuevo, con la barra oculta, cabe.
9. **Info (previo a RGB-16).** Con la API caída, `/projects/<code>/scoring` responde 500.
10. **Info.** Cada petición inválida deja una fila de auditoría `rejected` sin límite; los campos extra del cuerpo de `/start` se ignoran.
11. **Info.** `1e2` en una semana se envía como 100 (válido).
12. **Info (entorno).** Un `next-server` ajeno y obsoleto escuchaba en el puerto 3000; la verificación usó el 3010.

## Pantallazos

[screenshots/](screenshots/), claro y oscuro, 1280 px página completa (el menú lateral sticky aparece partido por la captura) y 360 px: `start-no-scale`, `start-plan-proposed`, `start-weeks-error`, `start-confirm`, `start-confirm-invalid-week`, `start-success`, `start-dnp-error`, `start-dnp`, `start-dnp-success`, `start-403`, `start-dnp-403`, `start-409`, `start-no-scoring`, `start-network-error`, `start-load-error`, `start-mobile`, `start-mobile-dnp`. Todas con el build real y la API real, con datos ficticios. Los de la primera pasada se borraron y regeneraron.

## No verificado

Supabase, Cloud Run, Vercel (prohibido); roles reales por sesión (RGB-2/4); lector de pantalla real (solo árbol de roles, etiquetas y axe).

## Veredicto del Juez

**APROBADO.** Sin hallazgos bloqueantes. Revisión independiente del diff real (`main...HEAD` más los cambios sin commit), sin tocar código ni tests.

### Ejecutado por el Juez

- `ruff check backend` y `ruff format --check backend`: limpios (157 archivos).
- `pytest backend` con Postgres local (`DATABASE_URL=postgresql://rgb:rgb@localhost:54329/rgb`, venv propio): **1085 passed**. Los tests de infraestructura levantan el esquema con el migrador, así que la 009 se aplica sobre una base limpia.
- `npm --prefix frontend test`: 70 suites, **1579 tests** en verde; `lint` y `typecheck` limpios.

### Comprobación por punto

1. **Criterios.** Autoridad: `start_project.py` (`execute`) comprueba `has_authority` con la autoridad de la fase 0 (`phase_definition(0).authority`) antes de validar el cuerpo y antes de cualquier escritura; el rechazo se devuelve y se audita (`_reject`), y la transacción se confirma con la fila `rejected`. `PromotionService.promote` vuelve a comprobarla. Congelado garantizado por el código y no solo por un test: `migrations/009_project_plans.sql` (`UNIQUE (project_id)`, `REVOKE UPDATE, DELETE, TRUNCATE` + disparador `reject_alteration`); el contenido del entregable de salida (scoring con ratings, pesos, umbral, nota, y plan) se escribe antes de promover y la promoción lo copia a `frozen_versions` (inmutable desde 004); tras la promoción el proyecto sale de la fase 0 y el scoring responde 409. Lo anterior lo ejercen `test_postgres_project_plans.py`, `test_start_routes_postgres.py` y `test_start_project.py`.
2. **TDD.** Cada pieza nueva tiene tests propios: dominio (`test_proposed_plan.py`), caso de uso con `create_autospec` (`test_start_project.py`), infraestructura con Postgres real (`test_postgres_project_plans.py`), rutas con simulados y con Postgres (`test_start_routes*.py`), arquitectura, y en el front `start.test.ts`, `StartPanel.test.tsx` y `scoring-start-page.test.tsx`. Los cambios en tests existentes (`test_opportunity_routes.py`, `test_queries.py`, `test_postgres_projects.py`, `test_architecture.py`) solo añaden el campo `project_type` o casos nuevos; no se relaja ninguna aserción. Los `weeks_by_phase` de los tests nuevos coinciden con `make_plan` (`{1: 2, 2: 2, 3: 4, 4: 5, 5: 8, 6: 40, 7: 4}`).
3. **DDD.** `project_plan.py`, `ports.py` y `errors.py` no importan FastAPI ni psycopg; el puerto `ProjectPlans` está en el dominio, el caso de uso en `application`, el adaptador en `infrastructure` y solo `api/dependencies.py` lo cablea (test de arquitectura nuevo en `test_architecture.py`). Las rutas solo traducen errores a HTTP.
4. **Seguridad.** RLS con `protect_study_table` y claves foráneas `(study_id, project_id)`; SQL parametrizado en `postgres_project_plans.py` (el único fragmento concatenado es el literal fijo `FOR UPDATE OF p`); `FOR UPDATE` sobre el proyecto serializa promociones concurrentes; plan, contenido congelado, auditoría y promoción en una misma transacción (`study_transaction`), con `RuntimeError` para revertir si la promoción fallase; los rechazos de negocio se auditan; otro estudio recibe 404; ninguna ruta de IA cambia estado, y el front no emite peticiones que no sean GET sin una acción humana.
5. **Migración 009.** Coherente con 006-008 (mismo patrón de `protect_study_table`, `REVOKE` y `reject_alteration`); se aplica en base limpia (la suite lo hace).
6. **Front.** Etiquetas asociadas, `role=alert`/`status`, foco gestionado tras éxito, error y apertura/cierre de la confirmación, Escape para cancelar, `aria-invalid`/`aria-describedby`, texto en español, solo clases de token (sin colores literales), y topes y mensaje de semanas reutilizados de `lib/plan-settings` (`export { MAX_WEEKS, validateWeeks }` en `lib/start.ts`), sin duplicarlos. El panel solo se monta en fase 0, con proyecto real y con tipología.
7. **Pantallazos.** Existen 34 en `docs/plans/RGB-16/screenshots/` (17 estados, claro y oscuro) y el log los enumera. Abrí `start-plan-proposed-light`, `start-success-dark`, `start-403-light` y `start-dnp-error-dark`: son del build real, muestran lo que dice el nombre (plan propuesto con total, aviso de éxito con «Ir a Inicio», 403 «No tienes autoridad… Socio, Director.», motivo obligatorio con error) y solo contienen datos ficticios («Nave logística (ficticia)», `PRY-2026-9xx`, `sample-user`). La barra lateral partida es el artefacto conocido de la captura de página completa con menú sticky, anotado en el log.
8. **Seguimientos.** Bien clasificados como no bloqueantes. El 2 («No perseguir» no impide promover después) es una laguna de definición de «descartada» que ya existía en RGB-9 y que ni el plan ni los criterios de RGB-16 cubren; los dos criterios de aceptación se cumplen. El hallazgo de 360 px es previo, afecta a todo el shell (barra fija de 232 px) y la plataforma es de escritorio. El 6 (409 antes que 403 para un rol sin autoridad con el proyecto ya promovido) revela solo un estado que la persona ya ve en la cartera; se acepta, pero conviene aplicar la autoridad antes que el estado cuando llegue RGB-4.
9. **Documentos.** El plan, el contrato y el log coinciden con el código (rutas, códigos 403/404/409/422, `project_type` en la ficha, tablas y archivos). Los criterios del plan siguen sin marcar: lo hace la persona que revisa.

### Hallazgos no bloqueantes añadidos por el Juez

- **Baja.** `/.mcp.json` (sin seguimiento) contiene la referencia de un proyecto Supabase y no es de la tarea: no debe entrar en el commit ni en el PR.
- **Baja.** Tras promover, el formulario de scoring de arriba sigue visible y habilitado hasta recargar; guardar daría 409 `not_an_opportunity` (el servidor es quien congela, la interfaz no lo refleja). Mejora para RGB-17.
- **Info.** Al cerrar la tarea faltan por actualizar `docs/estado.md`, Notion y el artifact de estado, como indica el plan.
