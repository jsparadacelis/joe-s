# Estado del MVP

Actualizado: 2026-10-23 (tras RGB-10). Fuente de verdad del backlog: Notion («RGB Proyectos · PRD y backlog del MVP»).

## Hecho

| Tarea | Qué quedó | Plan |
| --- | --- | --- |
| Baseline del repo (PR #1, #2) | README con alcance y stack, `CLAUDE.md` con reglas y flujo, skills de backend y frontend | — |
| **RGB-6** · Diseño base de la interfaz (PR #3) | Proyecto Next.js 16 + React 19 + Tailwind v4 en la raíz; layout con barra lateral y cabecera; 5 rutas con estado vacío; tokens claro/oscuro; Button, Panel, StatusChip, Notice, Table; 185 tests | [plan](plans/RGB-6/plan.md) · [log](plans/RGB-6/implementation_log.md) |
| **RGB-10** · Línea de fases navegable (PR #6) | `PhaseTimeline` con 8 fases (hecha/actual/vista), rutas `/proyectos`, `/proyectos/[codigo]` y `/proyectos/[codigo]/fase/[fase]`, modos edición / solo lectura / vista previa. Construida contra datos de ejemplo (`lib/fases.ts`, `lib/proyectos.ts`) porque RGB-9 no existe; 361 tests; 11 pantallazos | [plan](plans/RGB-10/plan.md) · [log](plans/RGB-10/implementation_log.md) |
| Regla de pantallazos (PR #4) | Todo PR de front incluye pantallazos en `docs/plans/RGB-N/screenshots/` | — |

## Decisiones

- **Stack del front:** el mismo de parcerolegal (Next.js 16, React 19, TypeScript estricto, Tailwind v4, `lucide-react`, Jest + Testing Library + `jest-axe`). Un solo proyecto Next en la raíz; la API vivirá en `app/api`.
- **Scaffold dentro de RGB-6:** RGB-1 (Infra) seguía pendiente; el scaffold del front se hizo en RGB-6. Postgres, Docker, migraciones y CI siguen sin hacer.
- **Accesibilidad como criterio:** texto ≥ 4.5:1 y foco ≥ 3:1 en ambos temas, medido en tests desde el CSS real. Dos tokens de foco (`--focus`, `--focus-on-side`) porque un solo color no servía en la barra lateral clara.
- **Front contra contrato propio:** cuando el backend no existe, el front define el contrato como tipos TypeScript y lo sirve desde datos ficticios (RGB-10). Al llegar el backend se sustituye `lib/proyectos.ts` por el cliente de la API.
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
- RGB-10: el anillo de la fase en pantalla se distingue poco de la tarjeta de la fase actual en claro (propuesta del Juez: `ring-inset ring-on-point`); las migas no muestran el nombre del proyecto; usar `estadoFase` en `lib/proyectos.ts`.
- RGB-1 (infra): Postgres con Docker, migraciones, CI.
- Observaciones menores del Juez: enlace «Saltar al contenido» con foco de contenido sobre la barra lateral clara; pares de contraste del test mantenidos a mano; versiones con `^`.

## Siguiente trabajo de front

RGB-22 (Plan y tiempos) depende de RGB-21 (backend de pausas) y RGB-10; RGB-23 de RGB-22; RGB-29 de RGB-24/27/28; RGB-34 de RGB-33. Mientras no exista el backend se construyen contra datos de ejemplo, como RGB-10.
