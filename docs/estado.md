# Estado del MVP

Actualizado: 2026-10-25 (tras desplegar las migraciones 006–008 y el backend). Fuente de verdad del backlog: Notion («RGB Proyectos · PRD y backlog del MVP»).

## Hecho

| Tarea | Qué quedó | Plan |
| --- | --- | --- |
| Baseline del repo (PR #1, #2) | README con alcance y stack, `CLAUDE.md` con reglas y flujo, skills de backend y frontend | — |
| **RGB-6** · Diseño base de la interfaz (PR #3) | Proyecto Next.js 16 + React 19 + Tailwind v4 en la raíz; layout con barra lateral y cabecera; 5 rutas con estado vacío; tokens claro/oscuro; Button, Panel, StatusChip, Notice, Table; 185 tests | [plan](plans/RGB-6/plan.md) · [log](plans/RGB-6/implementation_log.md) |
| **RGB-10** · Línea de fases navegable (PR #6) | `PhaseTimeline` con 8 fases (hecha/actual/vista), rutas `/projects`, `/projects/[code]` y `/projects/[code]/phase/[phase]` (antes en español), modos edición / solo lectura / vista previa. Construida contra datos de ejemplo (`lib/phases.ts`, `lib/projects.ts`) porque RGB-9 no existe; 361 tests; 11 pantallazos | [plan](plans/RGB-10/plan.md) · [log](plans/RGB-10/implementation_log.md) |
| **RGB-22** · Pestaña «Plan y tiempos» y semáforo por consumo (PR #8) | Pestañas del proyecto (`ProjectTabs`, layout `app/projects/[code]/layout.tsx`), ruta `plan-and-timing` con resumen, tabla por fase con barras de consumo, historial de pausas y pausa activa. Contrato en `lib/timing.ts` con datos de ejemplo (RGB-20/21 no existen). Semáforo ámbar ≥80 %, rojo >100 % decidido con enteros; 496 tests; 12 pantallazos | [plan](plans/RGB-22/plan.md) · [log](plans/RGB-22/implementation_log.md) |
| **RGB-29** · Pantalla de datos técnicos editables (PR #14) | Panel en la fase 2 (Briefing): referencia catastral validada, «Obtener datos técnicos», 26 datos en Parcela / Condiciones técnicas / Planeamiento con origen, «Editado» + Restaurar y «Verificado», contadores, capacidad en vivo, ruta manual si falla la consulta. Contrato en `lib/datos-tecnicos.ts` y `lib/capacidad.ts` con datos de ejemplo (RGB-24/27/28 sin hacer); proyecto de ejemplo `PRY-EJ-004`; 672 tests; 12 pantallazos | [plan](plans/RGB-29/plan.md) · [log](plans/RGB-29/implementation_log.md) |
| **RGB-34** · Visor 3D del terreno (PR #21) | Panel «Relieve 3D del terreno» en la fase 3: referencia catastral validada, Recorte, Lado máximo y Exageración; escena three.js (malla por altura, parcela con relleno que sigue el terreno, norte, zoom, teclado); lecturas y avisos en el DOM; libera WebGL al salir de la vista y mensaje sin WebGL. `three` 0.186.1 en un chunk diferido de 569 KB. Contrato en `lib/relief.ts` con datos sintéticos (RGB-33 sin hacer). Incluye el **refactor a inglés de todo el front** (tabla en `docs/front-rename-english.md`); 827 tests; 20 pantallazos | [plan](plans/RGB-34/plan.md) · [log](plans/RGB-34/implementation_log.md) |
| **RGB-1** · Baseline del backend (PR #10) | Backend FastAPI en `backend/` con `/api/health`, Postgres 16 local con Docker, migrador propio, `bash scripts/dev.sh` levanta todo, CI de front y backend, test de arquitectura DDD | [plan](plans/RGB-1/plan.md) · [log](plans/RGB-1/implementation_log.md) |
| **RGB-3** · Modelo multiestudio con seguridad por fila | Tabla `studies`, rol `rgb_app`, plantilla `protect_study_table`, comprobación `tables_without_rls()` en CI, `RequestContext` y `study_transaction`; test de aislamiento A/B con Postgres real | [plan](plans/RGB-3/plan.md) · [log](plans/RGB-3/implementation_log.md) |
| **RGB-5** · Registro de auditoría inalterable | Tabla `audit_events` solo de inserción (permisos y disparador), `AuditEvent`, puerto `AuditLog`, `audit()` y adaptador Postgres que escribe en la transacción de negocio; 61 tests | [plan](plans/RGB-5/plan.md) · [log](plans/RGB-5/implementation_log.md) |
| **RGB-8** · Modelo de ciclo de vida | Migración `004`: `phase_config` (8 fases), `projects`, `exit_deliverables`, `frozen_versions` e `promotions` inmutables, `internal_milestones`; dominio `PHASES`, `Proyecto`, `FrozenVersion`, `Promocion`; 147 tests | [plan](plans/RGB-8/plan.md) · [log](plans/RGB-8/implementation_log.md) |
| **RGB-9** · Servicio de promoción | `PromotionService` (promover, retener, no perseguir) en una transacción con RLS: autoridad por rol o habilitación, validador de entregable por fase, congela versión, abre la fase siguiente y audita también los rechazos. Rutas `POST /api/projects/{code}/promote`, `/hold`, `/no-perseguir` con 403 (quién puede) y 422 (qué falta); 216 tests | [plan](plans/RGB-9/plan.md) · [log](plans/RGB-9/implementation_log.md) |
| Preparación del despliegue (PR #17) | `Dockerfile` del backend para Cloud Run (EE. UU.), dependencias de desarrollo en `requirements-dev.txt`, guía en [despliegue](despliegue.md). Falta crear los proyectos en Supabase, Cloud Run y Vercel (cuentas) | — |
| **RGB-11** · Cartera del estudio, solo front (**no cerrada**: falta el back) | `/portfolio` con resumen de 4 cifras, filtros por semáforo y responsable y tabla (fase, estado, hito, responsable, bloqueo, días sin actualizar) con región de scroll accesible; el semáforo es siempre el de `consumptionTrafficLight` de la fase actual del plan. Datos de ejemplo en `lib/portfolio.ts`, con `PRY-EJ-005..007` añadidos a `lib/projects.ts` y `lib/timing.ts`; 1115 tests; 30 pantallazos. Back pendiente: [análisis](plans/RGB-11/backend-analysis.md) y [huecos](huecos-backend.md) | [plan](plans/RGB-11/plan.md) · [log](plans/RGB-11/implementation_log.md) |
| **RGB-23** · Semanas de la fase y pausas en la cartera | Columna «Semanas de la fase» (activas / plan) en `/portfolio` con barra de consumo (`aria-valuenow` acotado a 100, `valuetext` con el porcentaje real), «Reloj parado» en pausa y «Sin plan hasta promover» en oportunidades; el color sale de `consumptionTrafficLight` y coincide con «Plan y tiempos». Datos de ejemplo hasta RGB-20/21 y el back de RGB-11; 1156 tests; 30 pantallazos | [plan](plans/RGB-23/plan.md) · [log](plans/RGB-23/implementation_log.md) |
| **RGB-13** · Alta de oportunidad (full-stack, lista salvo decisiones de producto) | Migración `006_opportunities`, contexto `opportunity` (alta con código `PRY-AAAA-NNN` y auditoría) y contexto `portfolio` de solo lectura; `POST /api/opportunities`, `GET /api/portfolio`, `GET /api/projects/{code}`. Front: `/opportunities/new`, cartera y fichas leen la API (los `PRY-EJ-00N` siguen locales). Verificado de punta a punta con la API real y Playwright (claro y oscuro, axe); 549 tests de back y 1278 de front; pantallazos `integration-*` | [plan](plans/RGB-13/plan.md) · [log](plans/RGB-13/implementation_log.md) |
| **RGB-21** · Pausas con motivo, fecha prevista y reanudación (full-stack, lista salvo despliegue) | Migración `007_pauses`, contexto `timing` (pausar, reanudar, historial, auditoría y 403 auditado), `POST /api/projects/{code}/pause`, `.../resume`, `GET .../pauses` y campo `pause` en la cartera. Front: «Plan y tiempos» de un proyecto real con «Pausa activa», «Reanudar» con confirmación e historial; cartera con «En pausa», «Reanudación prevista el …» y «Vencida hace N días». Verificado de punta a punta con la API real y Playwright (claro y oscuro, axe, 403/409/422 reales); 658 tests de back y 1345 de front; pantallazos `integration-*` | [plan](plans/RGB-21/plan.md) · [log](plans/RGB-21/implementation_log.md) |
| Topes y 422 uniformes en los ajustes del plan (PR #29) | Semanas enteras entre 1 y 520, factor entre 0,1 y 10, mismos mensajes que el front; los valores que no caben dan 422 con CORS (antes 500); cualquier 422 de FastAPI sale como `{detail:{code,message}}`; siembra idempotente del estudio ficticio de desarrollo (`python -m backend.app.shared.seed_dev`, la llama `scripts/dev.sh`) | [plan](plans/backend-plan-limits/plan.md) · [log](plans/backend-plan-limits/implementation_log.md) |
| **RGB-15** · Plantillas de semanas y factor de escala | `make_plan(project_type, scale)` con redondeo half-up y mínimo 1 semana (industrial grande = 3-3-5-7-10-52-5); valores del PRD por defecto en el dominio y ajustes editables por estudio (`plan_templates`, `scale_factors`, con RLS y auditoría); rutas `GET /api/plan`, `GET /api/settings/plan` y `PUT` de plantillas y factores; 274 tests | [plan](plans/RGB-15/plan.md) · [log](plans/RGB-15/implementation_log.md) |
| **RGB-20** · Reloj activo por fase y calendario | Funciones puras `summarize_time` y `phase_spans_from_entries` (días → semanas con un decimal): activas y pausa por fase, pausa por motivo, total activo, calendario y desviación; pausa que cruza fases repartida; 317 tests. Sin persistencia ni ruta (RGB-21) | [plan](plans/RGB-20/plan.md) · [log](plans/RGB-20/implementation_log.md) |
| **RGB-14** · Scoring de oportunidades (full-stack, lista salvo despliegue y veredicto del Juez) | Migración `008_scoring` (`scoring_settings` por estudio, `opportunity_scorings` insert-only con ratings, pesos y umbral usados), dominio `compute_score` (half-up con `Decimal`), `GET/PUT /api/settings/scoring`, `POST/GET /api/projects/{code}/scoring`, auditoría; página `/projects/[code]/scoring` con nota en vivo, recomendación («la decisión es de la persona») e historial, sección «Scoring» en `/settings`, enlace desde la ficha de fase 0. Integración: mensajes de pesos del front iguales a los de la API y `computeScore` en aritmética entera (test cruzado con `score_cases.json`); 910 tests de back y 1479 de front en verde; prueba de punta a punta con la API real | [plan](plans/RGB-14/plan.md) · [log](plans/RGB-14/implementation_log.md) |
| Regla de pantallazos (PR #4) | Todo PR de front incluye pantallazos en `docs/plans/RGB-N/screenshots/` | — |
| Reordenado del repo (PR #23) y URLs en inglés (PR #24) | `frontend/` y `backend/` separados (Dockerfile y dependencias de Python dentro de `backend/`), URLs de página en inglés (`/projects`, `/portfolio`, `/to-promote`, `/settings`, `/weekly-report`, `plan-and-timing`, `phase`, `#content`). `main` protegida con el ruleset `main-rule`: todo por PR y checks `front`, `backend` y `Vercel` en verde | — |
| Infra desplegada | API en Cloud Run (`https://rgb-api-368607571687.us-central1.run.app`, pública, con CORS para `https://joe-s.vercel.app` y `http://localhost:3000`), base en Supabase, front en Vercel (*Root Directory* `frontend`). Verificado el 2026-10-24: `/api/health`, `/api/settings/plan` y `/api/plan` responden. Falta `NEXT_PUBLIC_API_URL` en Vercel | [despliegue](despliegue.md) |
| **Conexión front–API**, paso 1 · Ajustes del plan (PR #27) | Cliente HTTP (`lib/api.ts`) y pantalla `/settings` con las plantillas de semanas y los factores de escala conectados a la API, con topes en el cliente, errores accesibles y foco gestionado; 957 tests; 15 pantallazos. `NEXT_PUBLIC_API_URL` fijada en Vercel y aplicada: en producción `/settings` carga (200) con la URL de Cloud Run incrustada. Siguiente: botones de promoción | [plan](plans/connect-api-settings/plan.md) · [log](plans/connect-api-settings/implementation_log.md) |

## Decisiones

- **Stack del front:** el mismo de parcerolegal (Next.js 16, React 19, TypeScript estricto, Tailwind v4, `lucide-react`, Jest + Testing Library + `jest-axe`). Next en `frontend/` (Vercel, *Root Directory* `frontend`). El backend es Python/FastAPI en `backend/` (Cloud Run, ver [despliegue](despliegue.md)), con DDD y TDD: ver [arquitectura](arquitectura.md).
- **Scaffold dentro de RGB-6:** El scaffold del front se hizo en RGB-6 y RGB-1 completó backend, Postgres, migraciones y CI.
- **Accesibilidad como criterio:** texto ≥ 4.5:1 y foco ≥ 3:1 en ambos temas, medido en tests desde el CSS real. Dos tokens de foco (`--focus`, `--focus-on-side`) porque un solo color no servía en la barra lateral clara.
- **Front contra contrato propio:** cuando el backend no existe, el front define el contrato como tipos TypeScript y lo sirve desde datos ficticios (RGB-10). Al llegar el backend se sustituye `lib/projects.ts` por el cliente de la API.
- **Sin colores sueltos:** `--color-*: initial` en `@theme` y un test que falla si un componente usa una clase de color que no es un token.

## Flujo de trabajo

Cada tarea de front se orquesta con subagentes y se documenta en `docs/plans/RGB-N/`:

1. Escritor de tests (desde RGB-10): tests desde el plan y los criterios.
2. Desarrollador: implementa con buenas prácticas.
3. Tester: verifica los criterios e intenta romper.
4. Juez: aprobado o rechazado. Solo con aprobado se abre el PR.

El PR incluye pantallazos. La tarea pasa a «En revisión» y una persona la pasa a «Hecho». En RGB-6 el Juez rechazó la primera vez por un fallo real (foco invisible en la barra lateral clara) que los tests no detectaban.

## Pendiente conocido

- Pasada visual de RGB-6 en navegador (nadie la hizo; RGB-6 se mergeó antes de exigir pantallazos).
- `next/font/google` necesita red en el build: pasar a fuentes locales antes de montar CI.
- RGB-10: el anillo de la fase en pantalla se distingue poco de la tarjeta de la fase actual en claro (propuesta del Juez: `ring-inset ring-on-point`); las migas no muestran el nombre del proyecto; usar `phaseState` en `lib/projects.ts`.
- RGB-22: `aria-valuenow` >100 en barras sobre el plan (propuesta: `valuenow` acotado a 100 + `aria-valuetext` con el porcentaje real, ajustando plan y tests); `obtenerProyecto` se llama en layout y página (usar `cache()` o una sola fuente para la fase actual al conectar la API); fases hechas con 100 % exacto muestran «Atención» (decisión de producto).
- RGB-1 (infra): Postgres con Docker, migraciones, CI.
- Observaciones menores del Juez: enlace «Saltar al contenido» con foco de contenido sobre la barra lateral clara; pares de contraste del test mantenidos a mano; versiones con `^`.

## Siguiente trabajo de front

**Conexión con la API (paso 1 hecho):** la API de `main` solo ofrece promoción, `GET /api/plan` y los ajustes del plan; no hay lecturas de proyectos, entregables, tiempos, datos técnicos ni relieve, así que esas capas siguen con datos de ejemplo hasta que el backend las publique. Lo primero que se conecta son los ajustes del plan (`/settings`); ver [plan](plans/connect-api-settings/plan.md) y su [log](plans/connect-api-settings/implementation_log.md).

Con RGB-6, 10, 22, 29 y 34 hechas, la única tarea de front que queda es RGB-23 (semanas de la fase y pausas en la cartera), que necesita la cartera (RGB-11, full-stack, sin hacer). El resto de pendientes del front son seguimientos de las tareas ya hechas y la conexión de las capas de datos de ejemplo (`lib/projects.ts`, `lib/timing.ts`, `lib/technical-data.ts`, `lib/relief.ts`) con la API real cuando existan los servicios.

## Pendientes de RGB-29 (front)

- Comentario de `DatoTecnico` (manual = grupo Planeamiento) y descripción del panel cuando no es editable; quitar el `testTimeout` global de `frontend/jest.config.js`; aviso al reconsultar (sustituye lo escrito a mano); contraste del borde de controles `border-hair` (1,4:1, heredado de toda la app) y estilo de `aria-invalid`.
- Al llegar RGB-24/27/28/30: sustituir `obtenerDatosTecnicos` por el cliente de la API y `calcularCapacidad` por el servicio.

## Pendientes de RGB-34 (front)

- Rampa del tema oscuro con poco rango de luminancia (ampliar hasta un tono arena, manteniendo los umbrales de `frontend/__tests__/lib/relief-contrast.test.ts`); relleno más tenue o solo contorno cuando la parcela cubre la ventana; ×3 apenas se distingue de ×2 en la rústica con encuadre cenital.
- Encuadre inicial que recorta el borde sur en lienzos anchos y bajos; escuchar `webglcontextlost` y avisar; los colores de la escena no siguen un cambio de tema en caliente.
- Las URLs pasaron a inglés (decisión del usuario, 2026-10-24): `/proyectos`→`/projects`, `/cartera`→`/portfolio`, `/por-promover`→`/to-promote`, `/ajustes`→`/settings`, `/reporte-semanal`→`/weekly-report`, `plan-y-tiempos`→`plan-and-timing`, `fase`→`phase` y el ancla `#contenido`→`#content`. Los códigos de ejemplo (`PRY-EJ-00N`) siguen igual. Los planes antiguos de `docs/plans/` citan las URLs en español.

## Huecos del backend

Qué falta en el backend para quitar los datos de ejemplo del front, con su tarea y el orden recomendado: [huecos-backend.md](huecos-backend.md).

## Pendientes de la conexión con la API (ajustes del plan)

- Aviso de validación que persiste al volver al valor guardado; respuesta 200 mal formada que deja «Cargando…» sin «Reintentar»; etiquetas de dos líneas que desalinean los campos; `UNEXPECTED_MESSAGE` duplicado.
- Resuelto en el PR #29: topes alineados, 422 en vez de 500 sin CORS y siembra del estudio ficticio de desarrollo. Desplegado en Cloud Run el 2026-10-25.
- Scroll horizontal a 360 px por las migas del layout.

## Pendientes de RGB-11 (front)

- Al conectar `GET /api/portfolio`: mapeo snake_case → camelCase, estado `unknown`, hito sin fecha, `owner_id`/`owner_name` y `as_of` como fecha de referencia (ver el log). `todayIso()` usa la fecha UTC del navegador.
- Un proyecto en pausa con la fase al 83 % (ámbar) no cuenta como «en riesgo»: decidirlo con el backend.
- Opcionales: columna «Proyecto» fija en el scroll horizontal; contorno de foco sobre toda la fila; aviso `act(...)` de `next/link` en los tests de `PortfolioTable`; barra lateral cortada a 900 px en capturas de página completa.

## Pendientes de RGB-13

- `/opportunities/new` no tiene entrada de menú (solo el botón de la cartera); la barra lateral no marca nada activo en esa pantalla.
- `/projects` es `force-dynamic` (lee la API en cada petición); valorar caché o revalidación.
- Dato técnico, relieve, entregables y referencia catastral de un proyecto real siguen siendo de ejemplo (vacíos); «Plan y tiempos» muestra «Sin plan hasta promover».
- Permisos por rol para dar de alta oportunidades (RGB-4); la API de Cloud Run es pública (back y migración 006 desplegados el 2026-10-25).
- Estado `unknown` en cartera: sin cálculo de semáforo en servidor hasta RGB-16/17/21.
- Cliente y servidor recortan distinto (`trim` de JS no quita U+001C a U+001F ni U+0085; `strip` de Python no quita U+FEFF): un nombre solo de U+001F pasa el cliente y el servidor responde 422 «obligatorio» junto al campo. Inocuo, pero se puede alinear.
- Decisiones de producto pendientes: ver [huecos-backend](huecos-backend.md) (qué proyectos entran en la cartera, quién manda en el hito, dueño de «bloqueo»).

## Pendientes de RGB-23 (front)

- Contraste de la barra de pausa (`bg-off`) frente a su pista; barra de consumo compartida entre `PortfolioTable` y `TimingTable` (arregla también el `aria-valuenow` sin acotar de RGB-22); una comparación de fase del test B1 que compara un valor consigo mismo.
- Sustituir `phaseWeeks` por el valor de la API cuando existan RGB-20/21 y `GET /api/portfolio`.

## Pendientes de RGB-13

- «Plan y tiempos» de un proyecto real con fase mayor que 0 debería decir «Sin calcular», no «Sin plan hasta promover».
- La ficha de una oportunidad real muestra «Guardar» sobre un entregable sin campos (llega con RGB-36).
- `/opportunities/new` sin entrada de menú; `trim` de JS y `strip` de Python recortan distinto; permisos por rol (RGB-4).
- Hecho el 2026-10-25: backend en Cloud Run y migración 006 en Supabase. Falta sembrar el estudio ficticio en producción para poder escribir (ver [despliegue](despliegue.md)).

## Pendientes de RGB-21

- Desplegado el 2026-10-25: migración `007_pauses.sql` y backend (`/api/portfolio` responde 200).
- Aviso diario al director de proyecto cuando una pausa vence: sin canal de avisos ni planificador (la API expone `overdue` y `days_overdue`).
- No hay ruta para completar y aprobar el entregable de salida de la fase 0: para probar la promoción en local se inserta por SQL.
- Semanas planificadas de un proyecto real «Sin calcular» hasta RGB-16; unificar el `Pause` de ejemplo (`lib/timing.ts`) con `ProjectPause`.
- Permisos por rol real (RGB-2 y RGB-4): hoy el rol sale del contexto de desarrollo.
- «Proyectos activos» de la cartera cuenta también los proyectos en pausa (decisión de producto).

## Pendientes de RGB-21 (pausas)

- Aviso diario al director de proyecto cuando una pausa pasa su fecha prevista: sin canal de avisos ni planificador; tarea aparte. Hoy solo existe el indicador «Vencida».
- Ruta para aprobar el entregable de salida de la fase 0 (para promover por la API sin SQL); unificar `Pause` de ejemplo y `ProjectPause`; pausa que cruza fases (RGB-20/22); «Proyectos activos» cuenta los proyectos en pausa.
- Desplegado el 2026-10-25: migración 007 y backend en Cloud Run.

## Pendientes de RGB-14

- Desplegado el 2026-10-25: migración `008_scoring.sql` y backend (`GET /api/settings/scoring` responde 200). Falta sembrar el estudio ficticio en producción para escribir.
- Permisos por rol (RGB-2 y RGB-4): hoy cualquier rol puntúa y edita pesos y umbral.
- Un 422 del servidor en los pesos no nombra el criterio: el front marca los siete pesos (solo con el cliente validando antes se marca uno).
- Elegir tipología y escala a partir del scoring (RGB-16) y usar la recomendación en la ficha (RGB-17); la recomendación no cambia el estado del proyecto.
- Los roles de Escritor de tests, Desarrollador, Tester y verificación se ejecutaron en sesión única por frente; falta el veredicto independiente del Juez.
