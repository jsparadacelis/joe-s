# RGB-6 · Diseño base de la interfaz: layout, tokens y navegación

Tarea de Notion: https://app.notion.com/p/3fd444f747b381369b7dd9bbb64d82f7
Tipo: Frontend · Épica E0 · P0 · Tamaño M
Dependencia: RGB-1 (Infra). Decisión del 2026-10-20: el scaffold del front se hace aquí; la parte de infra de RGB-1 (Postgres, Docker, migraciones, CI) queda fuera.

## Objetivo

Dejar la base visual y estructural del front: layout de escritorio con barra lateral, sistema de tokens (claro y oscuro) y componentes base. Todo lo posterior (cartera, línea de fases, fichas) se construye sobre esto.

## Definición del front

Mismo stack que parcerolegal:

| Pieza | Decisión |
| --- | --- |
| Framework | Next.js 16 (App Router) + React 19, renderizado en servidor |
| Lenguaje | TypeScript en modo `strict`, alias `@/*` |
| Estilos | Tailwind CSS v4; tokens en bloque `@theme` de `app/globals.css`, respaldados por variables CSS |
| Iconos | `lucide-react` |
| Tests | Jest 30 + `@swc/jest` + Testing Library (`react`, `jest-dom`, `user-event`) + `jest-axe` |
| Tipografía | Inter vía `next/font` como grotesca; Newsreader itálica solo para el acento serif |
| Ubicación | Un solo proyecto Next en la raíz del repo; la API vivirá en `app/api` (route handlers) |

Estructura:

```
app/
  layout.tsx            # fuentes, <html lang="es">, AppShell
  globals.css           # tokens + base
  page.tsx              # redirect a /cartera
  cartera/page.tsx
  proyectos/page.tsx
  por-promover/page.tsx
  reporte-semanal/page.tsx
  ajustes/page.tsx
components/
  layout/  AppShell.tsx  Sidebar.tsx  Topbar.tsx  PageHead.tsx
  ui/      Button.tsx  Panel.tsx  StatusChip.tsx  Notice.tsx  Table.tsx
lib/
  nav.ts                # items de navegación
__tests__/              # espejo de components/ y app/
```

## Alcance

- Barra lateral: Cartera, Proyectos, Por promover, Reporte semanal, Ajustes y equipo. Elemento activo con `aria-current="page"`.
- Cabecera superior con migas de pan.
- Páginas de cada sección con cabecera y estado vacío (sin datos reales).
- Tokens de color y tipografía, claro y oscuro (sistema por defecto, `data-theme` fuerza uno).
- Componentes base: tabla, panel, chip de estado, botón, aviso.

Paleta (referencia: borrador navegable del Notion): grafito, cal, niebla, burdeos como acento.

| Token | Claro | Oscuro |
| --- | --- | --- |
| `bg` | `#F6F5F2` | `#161719` |
| `surface` | `#FFFFFF` | `#1E1F22` |
| `surface-2` | `#EBEAE6` | `#2A2B2F` |
| `hair` (borde) | `#D6D5D1` | `#34353A` |
| `line` | `#A9A8A4` | `#55565A` |
| `ink` / `ink-2` / `muted` | `#1C1D1F` / `#3A3B3E` / `#686865` | `#EBEAE6` / `#D6D5D1` / `#A9A8A4` |
| `point` (burdeos) / `point-soft` | `#5E2A35` / `#EFE4E6` | `#C78492` / `#3A2429` |
| `ok` / `ok-soft` | `#3E6B4A` / `#E3ECE5` | `#8CC09A` / `#23332A` |
| `warn` / `warn-soft` | `#856016` / `#F3EAD6` | `#E0B866` / `#3A3122` |
| `bad` / `bad-soft` | `#9B3326` / `#F4E1DD` | `#E5907F` / `#3D2623` |
| `off` / `off-soft` | `#8C8B87` / `#ECEBE8` | `#A9A8A4` / `#2A2B2F` |
| `side` / `side-ink` / `side-muted` / `side-active` | `#1C1D1F` / `#EBEAE6` / `#A9A8A4` / `#3A3B3E` | `#0F1011` / `#EBEAE6` / `#8C8B87` / `#2A2B2F` |

Nota (AA): `muted` (claro), `warn` (claro) y `point` (oscuro) se ajustaron respecto al borrador (`#6B6B68`, `#8A6418`, `#C27C8A`) porque 5 pares quedaban entre 4.44 y 4.48:1, por debajo de 4.5:1. Con los nuevos valores todos los pares texto/fondo cumplen WCAG AA.

Tipografía: escala 12/13/14/16/22/30 px. Radio base 8 px. Sidebar de 232 px.

## Fuera de alcance

Autenticación, datos, API, Postgres/Docker/CI, versión móvil, selector de tema en la UI, contenido real de las secciones.

## Criterios de aceptación

- [ ] Todos los colores salen de tokens y funcionan en claro y oscuro.
- [ ] Navegación por teclado con foco visible.
- [ ] Todo texto de la interfaz en español.
- [ ] `npm run build`, `npm run lint`, `tsc --noEmit` y `npm test` en verde.

## Flujo (3 subagentes)

1. **Desarrollador** (Sonnet): implementa siguiendo este plan y las buenas prácticas de `skills/frontend/SKILL.md`; TDD donde aplique; registra decisiones en `implementation_log.md`.
2. **Tester** (Sonnet): revisa cobertura, añade tests (componentes, teclado, axe, tokens sin colores sueltos, contraste), ejecuta la batería y reporta.
3. **Juez** (Opus): contrasta diff, plan y criterios; veredicto aprobado o rechazado con motivos.

Solo con veredicto aprobado se abre el PR y la tarea pasa a «En revisión».
