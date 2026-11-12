---
name: orchestrate-task
description: Orquesta una tarea RGB-N del backlog como sesión orquestadora. Para tareas Full-stack crea dos subagentes orquestadores (back y front) y garantiza con un Integrador y un Juez que ambos frentes cumplen el objetivo; para Backend o Frontend puras delega en un único frente.
---

# Orquestar una tarea del backlog

Eres la **sesión orquestadora**. No escribes código de producción: planificas, delegas, integras y verificas. Reglas del repo en `CLAUDE.md`; reglas de cada frente en `skills/backend/SKILL.md` y `skills/frontend/SKILL.md`.

## 1. Entender la tarea

1. Lee la tarea `RGB-N` en el Backlog de Notion (alcance, criterios, prompt, `Tipo`, `Depende de`).
2. Comprueba dependencias en `docs/estado.md`. Si falta una, dilo y propón alternativa; no la saltes.
3. Elige el modo por `Tipo`: **Full-stack** → dos frentes; **Backend** o **Frontend** → un frente; **Datos/Infra/Calidad** → pregunta.
4. Resume al usuario el plan y los archivos a tocar (regla de `CLAUDE.md`) y escribe `docs/plans/RGB-N/plan.md`.

## 2. Contrato primero (solo Full-stack)

Antes de lanzar los frentes, fija **el contrato de la API** en `docs/plans/RGB-N/contract.md`: rutas, métodos, cuerpos, códigos de error (`{detail:{code,message}}` en español), campos y ejemplos. Es la única fuente compartida; ningún frente la cambia por su cuenta: si necesita un cambio, lo pide al orquestador.

## 3. Lanzar los frentes (en paralelo, aislados)

Cada frente es un **subagente orquestador** con `isolation: "worktree"` y su propia rama (`feat/RGB-N-back`, `feat/RGB-N-front`). Cada uno ejecuta su pipeline completo y devuelve un informe; no abre PR ni mergea.

- **Frente back:** Escritor de tests (pytest, rojo) → Desarrollador (DDD, TDD, RLS y auditoría) → Tester (Postgres real, intenta romper; solo API local) → informe.
- **Frente front:** Escritor de tests → Desarrollador → Tester (build real, pantallazos claro/oscuro en `docs/plans/RGB-N/screenshots/`) → informe. Mientras el back no esté mergeado, el front trabaja contra el contrato con datos de ejemplo detrás de `lib/*.ts`.

Cada informe incluye: archivos tocados, tests y resultados, desviaciones del contrato, y qué no pudo verificar.

## 4. Integrar

El **Integrador** (subagente) une los dos frentes en una rama `feat/RGB-N`:

1. Fusiona back y front; resuelve conflictos sin cambiar comportamiento.
2. Sustituye los datos de ejemplo por el cliente real de la API.
3. Ejecuta todo: `ruff`, `pytest backend`, `lint`, `typecheck`, `test`, `build`.
4. Prueba de punta a punta: API local + build real + navegador; flujo feliz y errores del contrato. Contra la API desplegada, **solo lectura**.
5. Informa de cualquier discrepancia entre lo que el back devuelve y lo que el front espera.

## 5. Juzgar

El **Juez** (Opus) revisa la rama integrada, no los frentes por separado:

- Cada criterio de aceptación de Notion, con evidencia (test, captura o petición).
- Contrato respetado en ambos lados; sin código muerto ni mocks olvidados.
- Reglas de `CLAUDE.md`: código en inglés, UI en español, TDD, DDD, RLS, auditoría, sin datos reales, ninguna acción de IA cambia estados.
- Pantallazos existentes y correspondientes; seguridad (sin credenciales; escrituras solo locales).
- Veredicto **aprobado** o **rechazado** con bloqueantes (archivo:línea y corrección esperada) y seguimientos.

Si rechaza: manda cada bloqueante al frente que corresponda (con test primero), reintegra y vuelve a juzgar. Máximo 3 vueltas; después, para y pregunta.

## 6. Entregar

Solo con veredicto aprobado:

1. Abre el PR (o PRs separados si el usuario lo prefiere) con pantallazos enlazados y la advertencia de cualquier salvedad real.
2. Monta el monitor del PR cada 30 s. Los PRs de código los mergea la persona usuaria salvo permiso expreso; los de solo `.md` se mergean sin preguntar.
3. Al mergear: `docs/estado.md`, `plan.md` + `implementation_log.md`, página de Notion (estado «En revisión», una línea con lo que cambió) y memoria.
4. Sigue con la siguiente tarea por orden de ID si está clara; si no, explica la decisión.

## Reglas transversales

- Los subagentes no preguntan al usuario: devuelven bloqueos al orquestador, que decide o consulta.
- El pipeline fluye solo; para únicamente ante un bloqueo real o una decisión que sea del usuario.
- Un test incorrecto se corrige justificándolo en el log, nunca se debilita.
- Contra Cloud Run: solo lectura (no hay auth y cada escritura queda en la auditoría).
- Informa con honestidad: lo que no se verificó se dice, y un rechazo del Juez no se esconde.
