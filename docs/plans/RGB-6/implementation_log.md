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
