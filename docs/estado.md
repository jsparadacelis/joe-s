# Estado del MVP

Actualizado: 2026-10-26 (tras desplegar RGB-2, RGB-2b, RGB-4, RGB-4b y RGB-18). Fuente de verdad del backlog: Notion («RGB Proyectos · PRD y backlog del MVP»).

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
| **RGB-16** · Plan propuesto y promoción a Inicio o «no perseguir» (full-stack, desplegada el 2026-10-25) | Migración `009_project_plans` (línea base solo de inserción, con RLS), caso de uso `StartProject` (autoridad de la fase 0 antes de escribir, exige scoring, guarda la línea base, deja scoring y plan en el entregable de salida y promueve en una sola transacción, con rechazos auditados), `POST /api/projects/{code}/start`, `GET /api/projects/{code}/plan` y `project_type` en `GET /api/projects/{code}`. Front: `StartPanel` bajo el scoring con escala, plan propuesto editable (7 semanas, 1–520), «Promover a 1 · Inicio» con confirmación y «No perseguir» con motivo. Veredicto del Juez: aprobado; 1085 tests de back y 1579 de front; 34 pantallazos con el build real | [plan](plans/RGB-16/plan.md) · [log](plans/RGB-16/implementation_log.md) |
| **RGB-17a** · Ficha del proyecto, parte de solo lectura (full-stack, mergeada) | `GET /api/projects/{code}/sheet`: 8 bloques (identificación, encargo, gobierno, cliente, tiempo, riesgo, información, estado) con 20 campos obligatorios, completitud por bloque y total, y datos precargados de la oportunidad y el plan confirmado. Sin migración: la ficha es el contenido del entregable de la fase 1. Front: ficha en `/projects/[code]/phase/1` con «Obligatorio · falta», «Falta N»/«Completo», etiqueta «del scoring» y resumen accesible. El semáforo es opcional y automático (si fuera obligatorio, la ficha nunca llegaría al 100 %). Veredicto del Juez: aprobado; 1154 tests de back y 1664 de front; 10 pantallazos con el build real | [plan](plans/RGB-17/plan.md) · [log](plans/RGB-17/implementation_log.md) |
| **RGB-17b** · Edición de la ficha del proyecto (full-stack, desplegada el 2026-10-25) | `PUT /api/projects/{code}/sheet`: guarda los 15 campos manuales por bloque (texto, fechas ISO, límites de longitud, sin caracteres no almacenables) y el plan recalculado al cambiar tipología o escala. Solo con autoridad de la fase 1 y solo en la fase 1 (403/409/422 auditados). Sin migración: se fusiona en el contenido del entregable de la fase 1; la línea base `project_plans` no se toca y el plan recalculado gana al leer la ficha. Front: «Editar» por bloque con errores junto al campo, foco gestionado, recálculo con plan propuesto editable y «Confirmar recálculo». Veredicto del Juez: aprobado; 1355 tests de back y 1764 de front; 20 pantallazos `edit-*` | [plan](plans/RGB-17/plan-17b.md) · [log](plans/RGB-17/implementation_log.md) |
| **RGB-19** · Completitud de la ficha y promoción a Briefing, ficha v1 (full-stack, desplegada el 2026-10-25) | `POST /api/projects/{code}/sheet/promote`: solo con la ficha al 100 % (20 obligatorios) y con autoridad de la fase 1; congela la ficha como versión 1 (con el `sheet` ya resuelto dentro, que no se recalcula), marca el entregable de la fase 1 completo y aprobado y promueve a Briefing en una sola transacción, con `FOR UPDATE` sobre el proyecto (la perdedora de una carrera recibe 409 auditado). `GET`/`PUT /sheet` devuelven `frozen_version` y `permissions {can_edit, can_promote}` que calcula el servidor; con la fase > 1 se muestra la versión congelada en solo lectura. Auditoría de `promote` y `freeze` y de los rechazos. Sin migración. Front: `PromotePanel` (porcentaje, faltantes por bloque, botón con la razón visible, confirmación, éxito con enlace a la fase 2, 403/409/422 accesibles) y aviso «Ficha v1 congelada · solo lectura». Veredicto del Juez: aprobado; 1491 tests de back y 1814 de front; 24 pantallazos | [plan](plans/RGB-19/plan.md) · [log](plans/RGB-19/implementation_log.md) |
| **RGB-2a** · Autenticación y usuarios del estudio, parte del servidor (back, mergeada, `AUTH_MODE=dev` por defecto) | Verificación del JWT de Supabase Auth (solo ES256, `kid`, `iss`, `aud`, `exp`, `sub`, correo verificado; JWKS con caché y recarga acotada; la firma se verifica antes de abrir conexión). Tabla `study_members` (migración 010, RLS, `resolve_member` SECURITY DEFINER con rol `rgb_member_resolver`): invitación → activación al primer acceso. Doble factor (`aal2`) para socio, director y administración (`Role.ADMINISTRATION` nuevo). `POST /api/members/invitations`, `GET /api/members`, `POST /api/members/{id}/revoke` con auditoría; solo un socio invita o revoca a socio, director o administración y concede cualificaciones; no se puede revocar al último socio (con bloqueo de filas). Script `bootstrap_member` para el primer socio. En `AUTH_MODE=supabase` todas las rutas de negocio exigen token; en `dev` (por defecto) todo sigue como antes. Veredicto del Juez: aprobado; 1854 tests de back | [plan](plans/RGB-2/plan.md) · [log](plans/RGB-2/implementation_log.md) |
| **RGB-4** · Roles de estudio y de proyecto con permisos (back, mergeada en el PR #47 y desplegada el 2026-10-26) | Contexto `access` con la función central `can(actor, acción, recurso)` y la matriz «quién promueve» del PRD en una sola tabla, probada fase a fase (0-1 socio y director; 2-3 director de proyecto; 4-5 firmante habilitado; 6 dirección facultativa; 7 sponsor). Las funciones de las fases 2 a 7 se tienen **por proyecto**: tabla `project_members` (migración 011, RLS, claves compuestas que impiden cruzar estudios, solo altas y bajas) y `GET/POST /api/projects/{code}/members`, `DELETE .../{id}` con auditoría; las funciones de firma, dirección facultativa y sponsor solo las da un socio o director a quien tiene la cualificación. Promoción, inicio, ficha y pausas dejan de decidir por su cuenta (`has_authority`, `who_can` y `can_manage_pauses` retirados; test de arquitectura que lo vigila). La IA solo puede leer: un test recorre todas las acciones. En `AUTH_MODE=dev` las funciones salen del rol y las cualificaciones del usuario ficticio, como antes. 2020 tests de back en verde (con Postgres real) | [plan](plans/RGB-4/plan.md) · [log](plans/RGB-4/implementation_log.md) |
| **RGB-18** · Validación de la referencia catastral (back y módulo del front, en revisión) | Módulo de dominio `external_data/domain/cadastral_reference.py`: normaliza (mayúsculas, sin espacios) y valida 20 caracteres alfanuméricos, con mensajes en español, uno específico para la referencia de 14 (parcela) y códigos estables. Mismo módulo en `frontend/lib/cadastral-reference.ts` y 16 casos compartidos que leen los tests de los dos lados. `isValidCadastralReference` delega en él. 31 tests de back y 1845 de front. La pantalla aún muestra el mensaje genérico | [plan](plans/RGB-18/plan.md) · [log](plans/RGB-18/implementation_log.md) |
| **RGB-2b** · Pantalla de acceso con Google, sesión, doble factor y cierre de sesión (front + `GET /api/me`, en revisión; apagada con `NEXT_PUBLIC_AUTH_MODE=dev` por defecto) | `/login` con «Entrar con Google» y avisos (no invitada, acceso retirado, correo sin verificar), `/login/mfa` con alta del TOTP (QR y clave) y verificación, cierre de sesión y persona + rol en la cabecera. Sesión en cookies con `@supabase/ssr` y `proxy.ts` (que refresca y redirige a `/login`), para que las páginas que leen la API en el servidor envíen el token; `createApiClient` acepta un proveedor de token. `GET /api/me` devuelve rol y cualificaciones. En modo `dev` no cambia nada y el build no necesita variables de Supabase. Veredicto del Juez: aprobado; 2009 tests de front y 278 de la API; 18 pantallazos con el build real (claro y oscuro). Google, el TOTP y `aal2` reales **no están verificados**: el Tester usó un Supabase simulado | [plan](plans/RGB-2/plan-2b.md) · [log](plans/RGB-2/implementation_log.md) |
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
- Hecho el 2026-10-25: backend en Cloud Run y migración 006 en Supabase. El estudio ficticio se sembró el 2026-10-25 (ver [despliegue](despliegue.md)).

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

- Desplegado el 2026-10-25: migración `008_scoring.sql` y backend (`GET /api/settings/scoring` responde 200). Estudio ficticio sembrado el mismo día.
- Permisos por rol (RGB-2 y RGB-4): hoy cualquier rol puntúa y edita pesos y umbral.
- Un 422 del servidor en los pesos no nombra el criterio: el front marca los siete pesos (solo con el cliente validando antes se marca uno).
- Elegir tipología y escala a partir del scoring (RGB-16) y usar la recomendación en la ficha (RGB-17); la recomendación no cambia el estado del proyecto.
- Los roles de Escritor de tests, Desarrollador, Tester y verificación se ejecutaron en sesión única por frente; falta el veredicto independiente del Juez.

## Pendientes de RGB-2

- **RGB-2b (front):** hecha (ver arriba). Para pasar a `AUTH_MODE=supabase` hay que seguir el **orden de activación** de [despliegue](despliegue.md): front desplegado en `dev` → Google en Supabase y primer socio → front en `supabase` (variables `NEXT_PUBLIC_*`, exige redesplegar) → solo entonces Cloud Run en `AUTH_MODE=supabase`. Si se invierte, el front deja de funcionar.
- **Acciones de la persona responsable** (ver [despliegue](despliegue.md)): activar Google en Supabase con credenciales OAuth propias, probar la migración 010 con el rol `postgres` (puede necesitar el GRANT/REVOKE de `CREATE` que ya incluye; no verificado fuera de local), crear al primer socio con `bootstrap_member`.
- Microsoft queda pendiente (el servidor ya es independiente del proveedor).
- No verificado: Google real, `aal2` real de Supabase, claims reales y producción.
- Seguimientos: mismo correo en dos estudios, un trigger que limite `status` a `revoked`, reactivar revocados, 503 si falla el JWKS, `/docs` público, cualquier rol lista los miembros.
- Siguiente: RGB-2b (pantalla de acceso). RGB-4 ya está hecha.

## Pendientes de RGB-19

- Desplegado el 2026-10-25: RGB-17 y RGB-19 en Cloud Run (revisión `rgb-api-00006-r42`, sin migración).
- Tras un 409 o tras promover, la página queda desactualizada hasta recargar: siguen visibles «Guardar» y «Editar» (el servidor los rechaza) y «Cambios guardados» en los bloques.
- El resumen de la ficha y el panel de promoción repiten «Faltan por rellenar» y el porcentaje; hay un aviso de lint por un import sin usar en un test.
- No verificado: roles reales (RGB-2 y RGB-4), producción y lector de pantalla real.
- Siguiente en el backlog: la épica E5 (brief manual y promoción a Anteproyecto) y RGB-2/RGB-4 (acceso con usuarios y roles) antes de dar acceso a más personas.

## Pendientes de RGB-17

- Última escritura gana, sin control de versión; Escape y Cancelar descartan el borrador sin avisar; cambiar de escala descarta las semanas editadas.
- Hay dos planes (el de la ficha y la línea base de `project_plans`) hasta que RGB-19 congele la ficha v1; `/plan` y `/plan-and-timing` siguen con la línea base.
- Seguimientos de 17a: límite de tiempo en la carga de la ficha, `dl`/`dt`/`dd` para etiqueta y valor, la cabecera de la página desborda con nombres largos sin espacios (previo), «Guardar» del entregable convive con los de cada bloque, 360 px.
- El semáforo lo rellenará el consumo de tiempos; RGB-19 no debe exigirlo. Falta añadir `.mcp.json` a `.gitignore`.

## Pendientes de RGB-16

- Desplegado el 2026-10-25: migración `009_project_plans.sql` en Supabase y backend en Cloud Run (revisión `rgb-api-00005-9tj`). Estudio ficticio sembrado en producción (`Estudio de desarrollo`), así que las escrituras ya funcionan.
- «No perseguir» solo registra la decisión (heredado de RGB-9): la fase sigue en 0 y el panel vuelve a ofrecer «Promover». Decidir si descartar cierra la oportunidad (tarea aparte).
- Con el proyecto ya promovido, un rol sin autoridad recibe 409 en vez de 403 (ordenar con RGB-4).
- Tras promover, el formulario de scoring sigue visible hasta recargar (guardar daría 409).
- Cambiar de escala descarta en silencio las semanas editadas; `save_exit_content` sobrescribe un entregable de fase 0 existente.
- A 360 px la barra lateral fija desborda todo el shell (previo); con la API caída `/projects/[code]/scoring` responde 500 (previo).
- La ficha en borrador llega con RGB-17: hoy el contenido congelado lleva cliente, ubicación, tipología, escala y plan.
- Permisos por rol reales (RGB-2 y RGB-4).

## Pendientes de RGB-4

- **Desplegado el 2026-10-26** (PR #47 y siguientes): migraciones 010 y 011 en Supabase y backend en Cloud Run (revisión `rgb-api-00007-5tc`). Mientras `AUTH_MODE=dev`, nada cambia para el front.
- **Antes de `AUTH_MODE=supabase`:** asignar el equipo de cada proyecto (director de proyecto en los proyectos en fase 2 o 3, etc.); sin asignaciones nadie salvo socio y director promueve en fases 0 y 1, y nadie en las siguientes. No hay pantalla para asignar equipo (tarea de front aparte).
- **Cambia el comportamiento en fases 2 y 3:** promueve el director de proyecto **de ese proyecto** (decisión del 2026-10-26, según el PRD); socio y director ya no lo suplen.
- **RGB-4b (2026-10-26):** scoring, ajustes del plan y del scoring y alta de oportunidades ya consultan la política: puntuar y cambiar ajustes, solo socio y director (antes, cualquier rol); alta de oportunidades, socio, director y director de proyecto. Un rol sin permiso recibe 403 `no_authority`. Esos rechazos no se auditan.
- `APPROVE_DELIVERABLE` y `MANAGE_STUDY_MEMBERS` existen en la política pero los usarán RGB-36 y la gestión de miembros de RGB-2a (que mantiene su propia regla de invitación).
- Una persona con la cualificación pero sin la función en el proyecto no promueve: la cualificación solo la habilita para recibirla.
- Veredicto del Juez: pendiente.

## Pendientes de RGB-18

- Mostrar en pantalla los mensajes del módulo (`TechnicalDataEditor` y `ReliefViewer` siguen con «debe tener 20 caracteres»): trabajo de interfaz con pantallazos.
- La ficha del proyecto guarda `cadastral_reference` como texto libre; validarla al guardar es una decisión de producto aparte.
- RGB-24 (cliente del Catastro) debe llamar a `validate_cadastral_reference` antes de consultar.
- Veredicto del Juez: pendiente.

## Pendientes de RGB-2b

- **Antes de activar:** probar con Supabase real Google, el alta del TOTP, `aal2` y el camino servidor autenticado (`/projects` leyendo el token de las cookies); aplicar la migración 010 en una rama de Supabase primero (`ALTER … OWNER` puede fallar con `postgres`).
- 401/403 en páginas del servidor sin traducir a pantallas: una persona revocada con sesión válida ve un instante la estructura y un error hasta que la cabecera la expulsa (la API no filtra datos). Una persona revocada no es expulsada al instante, sino en la siguiente carga.
- TOTP: cada visita a `/login/mfa` sin factor verificado crea un factor sin verificar, sin nombre y sin limpieza (posible `mfa_factor_name_conflict` real). Sin recuperación del factor perdido.
- `registerServerTokenProvider` (registro global del lector de cookies) funciona y falla cerrado, pero es una solución con pegas; alternativa: dividir `lib/api` en servidor y cliente.
- `getSession()` en el servidor escribe un aviso por render (solo reenvía el token; la API lo verifica). `isAsset` del proxy deja pasar rutas cuyo último segmento tenga extensión. La cookie de ayuda del doble factor puede caducar hasta una hora mal.
- Sin aviso al caer en `/login` por un 401. Volver a `dev` exige cambiar la variable en Vercel y redesplegar. Microsoft queda fuera (segundo botón más adelante).
- `.mcp.json` sigue sin seguir ni ignorar (añadirlo a `.gitignore`).

## Pendientes de RGB-4b

- **Cambia el comportamiento:** en `AUTH_MODE=supabase` (y en `dev` con otro rol) un arquitecto, líder técnico, colaborador de obra o administración ya no puede puntuar, cambiar ajustes ni dar de alta oportunidades. Con el usuario de desarrollo por defecto (socio) nada cambia.
- Los rechazos de estas tres acciones no quedan en el registro de auditoría.
- El front no oculta aún los botones a quien no tiene permiso (recibe el 403 y su mensaje).
- Veredicto del Juez: pendiente.

## Despliegue del 2026-10-26

Producción lleva ya RGB-2a/2b, RGB-4/4b y RGB-18: migraciones 010 y 011, backend `rgb-api-00007-5tc` y front en Vercel (`6a90af1`), todo en modo `dev` (sin acceso con usuarios). Detalle y vuelta atrás en [despliegue](despliegue.md). **Falta** (acciones de la persona responsable): activar Google en Supabase, crear al primer socio con `bootstrap_member` y encender el acceso en el orden indicado.

## Rendimiento (PERF-1, 2026-10-27)
Las acciones tardaban ≥ 1,2 s porque la API (`us-central1`) abría una conexión nueva a la base de datos (Irlanda) en cada petición. Pool de conexiones desplegado (`DB_POOL_MAX=4`): ~0,64 s en servidor. El resto es distancia API↔BD; pendiente decidir el traslado (Railway o región UE). Detalle en `docs/plans/PERF-1/`.

## RGB-2c · alta del doble factor (2026-11-01)
Primer contacto con Supabase real: Google, TOTP y `aal2` funcionan. El socio quedó bloqueado por dos fallos de `/login/mfa`: recargar dejaba un factor pendiente sin QR recuperable y el QR (SVG transparente) no se veía en tema oscuro. Arreglo: la pantalla retira los factores pendientes (los lee de `listFactors().all`, no de `totp`) antes de crear uno nuevo, muestra «Código de error» con el `code` de Supabase y pinta el QR sobre blanco. Sigue sin haber recuperación del segundo factor perdido. Plan: [plan-2c](plans/RGB-2/plan-2c.md).

## RGB-48 · Equipo del estudio (2026-11-01)
Sección «Equipo del estudio» en `/settings`: invitar por correo con rol y cualificaciones, ver el estado de cada persona (invitada, activa, acceso retirado) y retirar acceso con confirmación. Usa las rutas de RGB-2a, sin cambios de back; la persona invitada se activa al entrar con Google con ese correo. Veredicto del Juez: aprobado; 2096 tests de front; 29 pantallazos con el build y la API reales. Seguimiento menor: título visible del formulario, nombre accesible del foco tras retirar, 403 al listar con un rol sin permiso, desbordamiento a 320 px del shell. Plan: [plan](plans/RGB-48/plan.md) · [log](plans/RGB-48/implementation_log.md).

## RGB-49 · Equipo del proyecto (2026-11-01)
Pestaña «Equipo» en el proyecto (`/projects/[code]/team`): asignar y quitar funciones por proyecto (director de proyecto, líder técnico, arquitecto, colaborador de obra, firmante habilitado, dirección facultativa y sponsor) con las rutas de RGB-4, sin cambios de back. Probado de extremo a extremo: una persona sin autoridad global puede promover las fases 2 y 3 solo del proyecto donde es director de proyecto, y deja de poder al quitarla. Veredicto del Juez: aprobado; 2170 tests de front; 52 pantallazos. Seguimiento menor: recargar el equipo tras 404/409, título visible del formulario. Plan: [plan](plans/RGB-49/plan.md) · [log](plans/RGB-49/implementation_log.md).

## RGB-24 · Cliente del Catastro (2026-11-01)
`GET /api/cadastre/{reference}` consulta en servidor los datos no protegidos del Catastro (`Consulta_DNPRC` y `Consulta_CPMRC`, XML, sin certificado): dirección, municipio, provincia, clase, uso, año de construcción, superficies, unidades constructivas y coordenadas WGS84. Nunca titularidad: el modelo no la tiene y un test inyecta campos de titular en parser, gateway y base de datos. Caché de 30 días por referencia y estudio (`cadastral_cache`, migración 012, con RLS); la llamada externa se hace sin conexión de la base abierta. Errores: 422 (mensajes de RGB-18), 404 `cadastral_reference_not_found`, 503 `cadastre_unavailable` con la ruta manual. Probado con respuestas grabadas (calles ficticias); 2187 tests de back. Pendiente: conectar la pantalla de datos técnicos (hoy con datos de ejemplo) y guardar los datos en el modelo de dato técnico (RGB-28). Plan: [plan](plans/RGB-24/plan.md) · [log](plans/RGB-24/implementation_log.md).

## RGB-28 · Modelo de dato técnico (2026-11-01)
Contexto `technical_data`: catálogo de 26 datos (parcela, condiciones técnicas, planeamiento) con valor, origen, original, editado y verificado. Editar, restaurar, verificar, verificar todo y «volver a consultar» el Catastro (RGB-24): lo editado y lo manual se conservan, lo no editado se sustituye y pierde la verificación si cambia; si el Catastro falla no se toca nada. Todo queda en auditoría, también los rechazos. Solo en fase 2 y con autoridad vía `can(EDIT_DELIVERABLE)`: hoy solo el director de proyecto de ese proyecto (un socio puede asignarse esa función desde la pestaña «Equipo»). Rutas `/api/projects/{code}/technical-data…`; migración 013 con RLS; JSON de paridad del catálogo con el front. 2418 tests de back. Pendiente: conectar la pantalla de datos técnicos (RGB-29), congelar los datos al promover. Plan: [plan](plans/RGB-28/plan.md) · [log](plans/RGB-28/implementation_log.md).

## RGB-51 · Pantalla de datos técnicos conectada (2026-11-01)
El panel de datos técnicos de la fase 2 ya lee y guarda en el servidor (RGB-24 y RGB-28): editar, restaurar, verificar, «Marcar todo como verificado» y «Obtener datos técnicos» / volver a consultar el Catastro, con los errores reales (403 y 409 → solo lectura con el mensaje del servidor, 422 en la fila, 503 con ruta manual) y los mensajes de la referencia catastral de RGB-18. Se pinta lo que devuelve el servidor. Los proyectos de ejemplo `PRY-EJ-*` siguen con datos locales. Un dato verificado ya no se puede desmarcar (el servidor no lo permite). Veredicto del Juez: aprobado; 2302 tests de front; 46 pantallazos. Seguimientos: «Sin dato» en listas con valor da 422, `readOnly` en solo lectura, prueba de foco en navegador real, y verificar con una asignación real de director en modo `supabase`. Plan: [plan](plans/RGB-51/plan.md) · [log](plans/RGB-51/implementation_log.md).

## RGB-25 · Perímetro INSPIRE (2026-11-01, PR abierto)
`GET /api/cadastre/{reference}/plot` consulta el WFS INSPIRE del Catastro (sin certificado, siempre en EPSG:4326) y devuelve el polígono en GeoJSON, la superficie calculada con proyección UTM propia (parcela de prueba 4714805BC6841S0001FY: 2.905,99 m² frente a 2.908 oficial, 0,07 %), la diferencia con la superficie catastral (aviso si supera el 3 %), longitudes de lindes y centroide. Caché de 30 días por estudio (migración 014, con RLS), sin conexión de la base abierta durante la llamada externa y sin titularidad. 2565 tests de back. **Pendiente de cerrar:** mergear el PR, aplicar la migración 014 en producción y desplegar la API. Plan: [plan](plans/RGB-25/plan.md) · [log](plans/RGB-25/implementation_log.md).

## RGB-26 · Altitud, pendiente y producción fotovoltaica (2026-11-01, PR abierto)
`GET /api/cadastre/{reference}/terrain` (altitud en el centroide y pendiente estimada con su categoría, Open-Meteo) y `GET .../pv` (producción anual en kWh/kWp, PVGIS con inclinación óptima y 14 % de pérdidas). «Obtener datos técnicos» (`/refresh`) rellena ahora también `polygonPlotArea` (INSPIRE), `altitude`, `slope`, `slopeType` y `pvProduction`; cada fuente externa falla por separado (el Catastro se guarda igual y la respuesta lista `unavailable`). Caché de 30 días por estudio (migración 015, con RLS). **Límite conocido:** la malla de Open-Meteo es de ~90 m, así que la pendiente de una parcela pequeña es muy gruesa (34,6 % en la parcela de prueba, que es exagerado); se marca `estimated`. 2798 tests de back. Pendiente: mergear, migración 015 en producción y desplegar; aviso de `unavailable` en la pantalla. Plan: [plan](plans/RGB-26/plan.md) · [log](plans/RGB-26/implementation_log.md).

## RGB-27 · Tablas técnicas normativas (2026-11-01, pendiente de revisión humana)
Tablas en JSON con fuente, documento, URL, versión, fecha, páginas y sha256 del PDF, y `status` por entrada (`ok` / `verify`), más funciones de dominio puro `climate_zone`, `seismic_acceleration`, `seismic_k`, `wind_zone` y `snow_zone` que devuelven `{value, source, table, status}` o `None`. Solo Barcelona (08) y Valencia (46): zona climática del CTE DB-HE (Anejo B), 510 entradas del Anejo 1 de la NCSE-02 (todas K = 1,0), y viento y nieve del DB-SE-AE, que en el documento vigente son **mapas** (figuras D.1 y E.2), leídos a nivel de provincia y marcados `verify`. **No está cableado** al botón «Obtener datos técnicos» ni a ninguna ruta, a propósito: hasta que una persona revise la transcripción, estos valores no llegan a un proyecto. Pendiente: revisión humana, el resto de provincias, y el cableado. Plan: [plan](plans/RGB-27/plan.md) · [log](plans/RGB-27/implementation_log.md).

## RGB-30 · Capacidad edificable (2026-11-01, PR abierto)
Función de dominio puro `compute_capacity` (Decimal, sin redondeo, igual que el front) y `GET /api/projects/{code}/capacity` de solo lectura: techo por edificabilidad, huella máxima, huella por plantas, techo máximo, condición que limita, cumplimiento de parcela mínima y porcentaje usado por lo existente, y la lista de datos que faltan. Caso del PRD (96 m², 1,5, 70 %, PB+2) → 144 m²t, limita la edificabilidad. 21 casos compartidos en JSON entre back y front (paridad con `capacity.ts`, que no cambió). Sin migración. Pendiente: conectar `CapacityPanel` a la ruta (hoy calcula en el cliente), la envolvente edificable con el retranqueo más restrictivo (v1.1) y decidir si el catálogo incorpora la superficie topográfica (hoy «Topográfico» usa la catastral). Plan: [plan](plans/RGB-30/plan.md) · [log](plans/RGB-30/implementation_log.md).

## RGB-31 · Alertas de cruce entre datos (2026-11-01, PR abierto)
`GET /api/projects/{code}/alerts` (solo lectura, abierta al estudio, sin escritura ni auditoría) evalúa cinco reglas puras sobre los datos técnicos vigentes: superficie catastral frente al polígono (> 3 %), uso catastral frente a tipología (tabla de incompatibilidades conservadora), construcción anterior a 1980, pendiente sobre el umbral (10 %) y municipio del Catastro frente a la ubicación de la ficha. Se recalculan en cada lectura (desaparecen al corregir el dato) y nunca cambian datos. Umbrales y tabla en `AlertConfig`, **marcados «para revisar con RGB»** en el log. Sin migración. 2991 tests de back. Pendiente: mostrar las alertas encima de los datos técnicos en el front y guardar la configuración por estudio. Plan: [plan](plans/RGB-31/plan.md) · [log](plans/RGB-31/implementation_log.md).

## RGB-32a · Brief y promoción a Anteproyecto, servidor (2026-11-01, PR abierto)
Contexto `briefing`: `GET/PUT /api/projects/{code}/brief` y `POST .../brief/promote`. El brief (necesidades, programa, condicionantes, presupuesto objetivo y plazo obligatorios; levantamiento topográfico y alineación opcionales; aprobación del cliente: pendiente / por correo / en reunión / con firma) vive en el entregable de la fase 2 (sin migración). Se promueve a Anteproyecto solo con los obligatorios completos, datos técnicos obtenidos y aprobación registrada; brief y fotografía de los 26 datos técnicos (con origen, original, editado y verificado; los no verificados quedan marcados) se congelan juntos como versión 1. El validador de la fase 2 también protege la ruta genérica de promoción. Solo el director de proyecto del proyecto edita y promueve; fase y autoridad como en RGB-19; carrera de 8 promociones: gana una y el resto recibe 409 auditado. 3253 tests de back. **Decisiones para revisar con RGB** en el log. Pendiente: la pantalla (RGB-32b). Plan: [plan](plans/RGB-32/plan.md) · [log](plans/RGB-32/implementation_log.md).

## RGB-32b · Pantalla del brief y promoción a Anteproyecto (2026-11-01, PR abierto)
En la fase 2 de un proyecto real, bajo los datos técnicos: formulario del brief (necesidades, programa, condicionantes, presupuesto objetivo y plazo obligatorios; levantamiento topográfico y alineación opcionales; aprobación del cliente), panel de promoción con los siete requisitos y la razón visible del botón, y, tras promover, el brief v1 congelado en solo lectura con la tabla de los datos técnicos (los no verificados señalados). Solo edita y promueve quien el servidor dice (director de proyecto del proyecto). Los `PRY-EJ-*` no llaman a la API. Veredicto del Juez: aprobado tras corregir el desbordamiento con textos largos; 2558 tests de front; 50 pantallazos. Seguimientos: proyecto en fase ≥ 3 sin versión congelada (tratar `phase > 2` como congelado), actualizar el panel de promoción tras «Obtener datos técnicos», limpiar avisos tras «Recargar» o promover, y repetir en navegador real el caso del texto largo. Plan: [plan](plans/RGB-32/plan-32b.md) · [log](plans/RGB-32/implementation_log.md).

## RGB-33 · Servicio de relieve (2026-11-01, PR abierto)
`GET /api/cadastre/{reference}/relief?margin=&max_side=` pide a la IDEE solo la ventana necesaria del MDT de 5 m (WCS `Elevacion4258_5`, formato `ArcGrid`, sin clave): ventana = parcela + margen (0, 10, 25, 50, 100 m), centrada en el centroide y marcada `clipped` si supera el lado máximo (100, 200, 300, 500 m); devuelve rejilla de alturas (norte→sur, `null` si no hay dato), límites, perímetro recortado a la ventana y si la parcela quedó cortada. Caché de 30 días por estudio (migración 016, con RLS), sin conexión de la base abierta durante la llamada externa. Criterio: parcela de 9 ha con lado 200 m → ventana de 200 × 200 m recortada. 3456 tests de back. **Seguimientos:** conectar el visor 3D (hoy con terreno sintético en `lib/relief.ts`; el log trae la tabla de equivalencias de nombres), y calcular la pendiente de RGB-26 sobre este MDT de 5 m (la malla de 90 m de Open-Meteo la exagera). Plan: [plan](plans/RGB-33/plan.md) · [log](plans/RGB-33/implementation_log.md).

## RGB-52 · Visor 3D conectado al servicio de relieve (2026-11-01, PR abierto)
El visor de la fase 3 de un proyecto real pide el relieve a `GET /api/cadastre/{reference}/relief` (RGB-33: MDT de 5 m del IGN por ventana recortada) en vez de generar un terreno sintético, con «Cargando relieve…», errores 422/404 junto a la referencia, 503/red/502 en un aviso con el resto de la pantalla intacto, carrera entre consultas resuelta, avisos de parcela cortada, celdas sin dato (estimadas con las vecinas) y perímetro ausente. Los `PRY-EJ-*` siguen con terreno sintético y sin llamadas. Las dimensiones en metros salen de la propia caja en grados (latitud media), no de los lados nominales UTM del servidor (que daban una escala ~3 % corta): el Juez rechazó la primera versión por eso. 2646 tests de front; 36 pantallazos (anteriores a la corrección de escala). Seguimientos: terreno anterior tras un error al reconsultar, texto impreciso de «Parcela mayor que la ventana», «Introduce los datos a mano» dentro del visor, desfase de media celda, y los pares claro/oscuro que faltan. Plan: [plan](plans/RGB-52/plan.md) · [log](plans/RGB-52/implementation_log.md).

## RGB-7 · Semillas de demostración ficticias (2026-11-01, rama `rgb-7/demo-seeds`, sin PR)
`python -m backend.app.shared.seed_demo` (o `bash scripts/seed-demo.sh`) siembra en local el «Estudio de demostración (ficticio)» (id propio `...de00`), 9 personas (`@example.com`, `active`, sin cuentas de Supabase) y 8 proyectos entre las fases 0 y 6, con una pausa en plazo y otra vencida y semáforo verde/ámbar/rojo. Usa los casos de uso reales como actor `seed`, en una transacción e idempotente. Se niega siempre (incluso con `--force`) con `ENVIRONMENT` no de desarrollo o hosts Supabase/pooler. Referencias catastrales `FICT…DEMO…ZZZZ`, válidas pero inexistentes. El test de arquitectura admite la siembra como segundo punto de composición. 3564 tests de back en verde. Plan: [plan](plans/RGB-7/plan.md) · [log](plans/RGB-7/implementation_log.md) · cómo entrar: [despliegue](despliegue.md).

## RGB-12a · «Por promover», servidor (2026-11-01, PR abierto)
`GET /api/to-promote` (solo lectura, abierta al estudio): una fila por proyecto con fase, entregable de salida, estado (`ready` / `in_progress` / `blocked`), motivo, quién promueve (Socio o director · Director de proyecto · Firmante habilitado · Dirección facultativa) y si la persona que consulta puede promover (`can`), más `ready_count` para la barra lateral. Listos primero, luego en curso y bloqueados, por antigüedad en la fase y código. «Listo» reutiliza los requisitos de cada fase (scoring, ficha 100 %, brief completo, entregable aprobado); «bloqueado» = pausa activa; se excluyen la fase 7 y los «no perseguir». 4 lecturas en bloque más 1 de funciones, sin N+1. Sin migración. 3670 tests de back. **Para revisar con RGB:** que un scoring «no perseguir» siga contando como listo, y si la fase 7 debe verse como «cerrado». Pendiente: la vista (RGB-12b) y el contador de la barra lateral. Plan: [plan](plans/RGB-12/plan.md) · [log](plans/RGB-12/implementation_log.md).
