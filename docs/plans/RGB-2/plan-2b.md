# RGB-2b · Pantalla de acceso con Google, sesión, doble factor y cierre de sesión

Parte de front de RGB-2 (P0). RGB-2a (servidor) está mergeada y apagada (`AUTH_MODE=dev` por defecto). Mientras el front no envíe el token, **no se puede pasar a `AUTH_MODE=supabase`**: este PR lo desbloquea. Flujo de front: Escritor de tests → Desarrollador → Tester → Juez → PR con pantallazos.

Fuente: [plan de RGB-2](plan.md) (decisiones de servidor), [despliegue](../../despliegue.md) (sección de acceso) y la página RGB-2 del Backlog.

## Criterios de aceptación (de RGB-2, parte de front)

- [ ] Una persona invitada entra con su cuenta de Google y llega a la aplicación.
- [ ] Una persona no invitada o revocada ve un mensaje claro en español y no entra.
- [ ] Socio, director y administración dan de alta el doble factor (TOTP) y lo usan para entrar; sin él no pasan.
- [ ] Se puede cerrar la sesión.
- [ ] Con `NEXT_PUBLIC_AUTH_MODE=dev` (por defecto) nada cambia: sin pantalla de acceso.

## Diseño

1. **Modo.** `NEXT_PUBLIC_AUTH_MODE` = `dev` (por defecto) o `supabase`. En `dev` el front se comporta como hoy. En `supabase` hace falta `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (clave publicable); sin ellas el modo `supabase` falla al arrancar con un mensaje claro.
2. **Sesión en cookies** con `@supabase/ssr` (no `localStorage`): hay páginas que leen la API en el servidor (`/projects` es `force-dynamic`), y el servidor necesita el token. Un `proxy` de Next (en Next 16 el antiguo *middleware*; **leer `node_modules/next/dist/docs/` antes de escribirlo**, ver `frontend/AGENTS.md`) refresca la sesión y redirige a `/login` a quien no la tenga.
3. **Rutas nuevas** (URLs en inglés, texto en español): `/login` (botón «Entrar con Google», avisos de error), `/auth/callback` (intercambia el código por la sesión), `/login/mfa` (alta del TOTP con código QR y clave, y verificación en cada entrada) y cierre de sesión desde la cabecera, con la persona y su rol visibles.
4. **Cliente de la API con token.** `createApiClient` acepta un proveedor de token y añade `Authorization: Bearer`. En el servidor lo lee de las cookies; en el navegador, de la sesión. Los tests siguen inyectando `fetch`.
5. **Errores del servidor → pantalla.** 401 `unauthenticated` → `/login`; 403 `mfa_required` → `/login/mfa`; 403 `not_invited` y `member_revoked` → `/login` con su aviso («No tienes invitación…», «Tu acceso ha sido retirado…»); 403 `email_not_verified` → aviso. Todos con `role="alert"` o equivalente y foco gestionado.
6. **Doble factor.** Supabase gestiona el TOTP (`mfa.enroll`, `challenge`, `verify`). El front solo lleva a la persona al nivel `aal2` cuando el servidor lo exige; no decide por su cuenta quién lo necesita.
7. **Quién soy.** Pequeño añadido de back: `GET /api/me` devuelve `{role, qualifications}` del contexto autenticado (en `dev`, el usuario ficticio). El correo y el nivel de aseguramiento (`aal`) salen de la sesión de Supabase en el navegador; la cabecera muestra el correo y el rol.
8. **Microsoft** queda fuera (decisión del 2026-10-25): el servidor es independiente del proveedor y será un segundo botón.

## Fuera de alcance

- Configurar Google en Supabase y crear al primer socio (acciones de la persona responsable, en [despliegue](../../despliegue.md)).
- Pasar Cloud Run a `AUTH_MODE=supabase` y fijar las variables en Vercel: se hace con el front desplegado y comprobado.
- Gestión de miembros en pantalla (invitar, revocar) y asignación de equipo por proyecto.
- Recuperación del doble factor perdido.

## Reglas de pruebas

- Ninguna prueba toca la red ni un Supabase real: el cliente de Supabase se inyecta y se simula (`jest.mock` o fábrica inyectable).
- Estados por pantalla: cargando, sin sesión, error (no invitada, revocada, sin 2FA), éxito, cierre de sesión. `jest-axe` en cada pantalla nueva.
- Con `NEXT_PUBLIC_AUTH_MODE=dev` los 1845 tests actuales siguen verdes sin tocarse.
- Pantallazos con el build real (claro y oscuro) en `docs/plans/RGB-2/screenshots-2b/`: `/login` y sus avisos, `/login/mfa` en alta y en verificación y la cabecera con la persona. Datos ficticios (`@example.com`); nada de claves reales.

## Archivos

**Back:** `app/api/me_routes.py`, `tests/api/test_me_routes.py`.
**Front (previstos):** `lib/auth.ts` (modo, mensajes, cliente de Supabase inyectable), `lib/supabase/{server,client}.ts`, `proxy.ts`, `app/login/page.tsx`, `app/login/mfa/page.tsx`, `app/auth/callback/route.ts`, `components/auth/*`, cambios en `lib/api.ts` y `components/layout/Topbar.tsx`, `__tests__/…`, `package.json` (`@supabase/supabase-js`, `@supabase/ssr`).
**Docs:** este plan, `implementation_log.md`, `docs/despliegue.md` (variables del front y orden de activación), `docs/estado.md`, Notion y el artifact.
