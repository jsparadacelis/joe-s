# Estado del MVP

Actualizado: 2026-10-23 (tras RGB-9, RGB-15, RGB-29 y RGB-34). Fuente de verdad del backlog: Notion («RGB Proyectos · PRD y backlog del MVP»).

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
| **RGB-15** · Plantillas de semanas y factor de escala | `make_plan(project_type, scale)` con redondeo half-up y mínimo 1 semana (industrial grande = 3-3-5-7-10-52-5); valores del PRD por defecto en el dominio y ajustes editables por estudio (`plan_templates`, `scale_factors`, con RLS y auditoría); rutas `GET /api/plan`, `GET /api/settings/plan` y `PUT` de plantillas y factores; 274 tests | [plan](plans/RGB-15/plan.md) · [log](plans/RGB-15/implementation_log.md) |
| Regla de pantallazos (PR #4) | Todo PR de front incluye pantallazos en `docs/plans/RGB-N/screenshots/` | — |

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

Con RGB-6, 10, 22, 29 y 34 hechas, la única tarea de front que queda es RGB-23 (semanas de la fase y pausas en la cartera), que necesita la cartera (RGB-11, full-stack, sin hacer). El resto de pendientes del front son seguimientos de las tareas ya hechas y la conexión de las capas de datos de ejemplo (`lib/projects.ts`, `lib/timing.ts`, `lib/technical-data.ts`, `lib/relief.ts`) con la API real cuando existan los servicios.

## Pendientes de RGB-29 (front)

- Comentario de `DatoTecnico` (manual = grupo Planeamiento) y descripción del panel cuando no es editable; quitar el `testTimeout` global de `frontend/jest.config.js`; aviso al reconsultar (sustituye lo escrito a mano); contraste del borde de controles `border-hair` (1,4:1, heredado de toda la app) y estilo de `aria-invalid`.
- Al llegar RGB-24/27/28/30: sustituir `obtenerDatosTecnicos` por el cliente de la API y `calcularCapacidad` por el servicio.

## Pendientes de RGB-34 (front)

- Rampa del tema oscuro con poco rango de luminancia (ampliar hasta un tono arena, manteniendo los umbrales de `frontend/__tests__/lib/relief-contrast.test.ts`); relleno más tenue o solo contorno cuando la parcela cubre la ventana; ×3 apenas se distingue de ×2 en la rústica con encuadre cenital.
- Encuadre inicial que recorta el borde sur en lienzos anchos y bajos; escuchar `webglcontextlost` y avisar; los colores de la escena no siguen un cambio de tema en caliente.
- Las URLs pasaron a inglés (decisión del usuario, 2026-10-24): `/proyectos`→`/projects`, `/cartera`→`/portfolio`, `/por-promover`→`/to-promote`, `/ajustes`→`/settings`, `/reporte-semanal`→`/weekly-report`, `plan-y-tiempos`→`plan-and-timing`, `fase`→`phase` y el ancla `#contenido`→`#content`. Los códigos de ejemplo (`PRY-EJ-00N`) siguen igual. Los planes antiguos de `docs/plans/` citan las URLs en español.
