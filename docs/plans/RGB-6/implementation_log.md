# RGB-6 · Implementation log

Fecha: 2026-10-20

## Qué se hizo

- Proyecto Next.js 16 + React 19 + TypeScript estricto + Tailwind v4 en la raíz del repo (scripts: dev, build, start, lint, typecheck, test).
- Tokens claro/oscuro en `app/globals.css`: variables CSS por tema (`:root`, `prefers-color-scheme: dark` con `:root:not([data-theme="light"])`, y `[data-theme="dark"]`) expuestas a Tailwind con `@theme inline`. Foco visible global en `point` y respeto de `prefers-reduced-motion`.
- Layout: `AppShell` (Server), `Sidebar` (232px, client por `usePathname`, `aria-current="page"`), `Topbar` (client, migas), `PageHead`, `EmptyState`.
- UI: `Button`, `Panel`, `StatusChip` (variantes `tag` y `semaforo` con punto), `Notice` (`status`/`alert`), `Table` (genérica, `th scope="col"`, `caption`).
- Rutas `/cartera`, `/proyectos`, `/por-promover`, `/reporte-semanal`, `/ajustes` con PageHead + estado vacío genérico; `/` redirige a `/cartera`.
- Navegación en `lib/nav.ts` (con `findNavItem`).
- Tests en `__tests__/` (espejo de app, components, lib), con `jest-axe` y un test que impide colores literales fuera de `globals.css`.

## Decisiones

- `@theme inline` + variables por tema: así las utilidades (`bg-surface`, `text-muted`...) siguen el tema sin duplicar `@theme`.
- Token extra `on-point` (texto sobre el acento: blanco en claro, `#161719` en oscuro) para que el botón `point` mantenga contraste en ambos temas; el plan no lo listaba.
- `EmptyState` en `components/layout` para no duplicar el estado vacío en 5 páginas (no estaba en la estructura del plan).
- Enlace «Saltar al contenido» en `AppShell` (accesibilidad por teclado).
- `Topbar` cliente (usa la ruta); `AppShell` y las páginas siguen siendo Server Components.
- `jest.config.js` basado en parcerolegal sin `transformIgnorePatterns` de react-markdown (no aplica).
- `next-env.d.ts` y `*.tsbuildinfo` ignorados en git (generados).

## Desviaciones del plan

- Componentes extra: `EmptyState` y token `on-point`.
- Las versiones instaladas son las últimas disponibles: Next 16.4.2, React 19.3.1, TypeScript 6.0.3, ESLint 9.39.5.
- No se probó visualmente en navegador (no se levantó `next dev`); verificación por tests y build.
- `npm install` reporta vulnerabilidades en dependencias transitivas (24); no se ejecutó `npm audit fix`.

## Resultados

- `npm run lint`: OK, sin avisos.
- `npm run typecheck`: OK.
- `npm test`: 13 suites, 34 tests, todos en verde.
- `npm run build`: OK, 8 páginas estáticas (`/`, 5 secciones, `/_not-found`).

## Tester

Ejecutado de forma independiente: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` y `next start` (puerto 3917, detenido al terminar) con curl a las rutas.

Tests añadidos:
- `__tests__/lib/contrast.test.ts`: parsea `app/globals.css` (claro, oscuro por `data-theme` y oscuro por media query), comprueba que coinciden con la tabla del plan y el contraste WCAG AA 4.5:1 de 20 pares texto/fondo por tema.
- `__tests__/keyboard-focus.test.tsx`: orden de Tab (skip link, 5 enlaces, botones; salta deshabilitados), Shift+Tab, Enter/Space, `aria-current` en las 5 rutas, subruta, ruta desconocida y prefijo parcial; regla `:focus-visible` con `var(--point)` y ausencia de `outline-none`.
- `__tests__/a11y-i18n.test.tsx`: jest-axe sobre AppShell con cada página, ruta desconocida y todos los componentes UI; `th scope`, `colSpan` del estado vacío, roles de Notice, `type`/`disabled` de Button, casos borde de PageHead/Panel/StatusChip/EmptyState; `lang="es"` y búsqueda de palabras de UI en inglés.

Verificación HTTP (build de producción): `/` 307 a `/cartera`; `/cartera`, `/proyectos`, `/por-promover`, `/reporte-semanal`, `/ajustes` 200; ruta inexistente 404. El HTML contiene `<html lang="es">`, la navegación, las migas, el skip link y `aria-current="page"`.

Hallazgos:
1. (Media) Cinco pares de tokens no alcanzan 4.5:1; los valores son los del plan, por lo que no se han modificado. Ratios: claro `muted/surface-2` 4.44 (Notice info y chip neutral), claro `muted/off-soft` 4.48 (chip `off`), claro `warn/warn-soft` 4.48 (Notice y chip warn), oscuro `point/point-soft` 4.47 (chip `point`; igual en oscuro por media query). Son texto de 12-13 px, así que aplica el umbral normal. Quedan registrados en `KNOWN_FAILURES` del test (se esperan por debajo de 4.5; si se corrige el token, el test fallará y habrá que quitar la entrada). Corrección sugerida: oscurecer ligeramente `muted` y `warn` en claro y aclarar `point` en oscuro.
2. (Baja) `Notice` elige el role por `tone` (`bad` = `alert`), no por «variante»; es razonable.
3. (Baja) No se verificó visualmente en navegador el aspecto del foco (solo CSS y comportamiento de foco en jsdom).
4. (Info) La compilación necesita acceso a Google Fonts (`next/font/google`); sin red, el build falla.
5. Sin hallazgos de alcance: no hay auth, API, Docker ni CI; `node_modules` y `.next` no están versionados; sin secretos.
