# RGB-2 · Autenticación con Google o Microsoft y usuarios del estudio

Tarea de back (P0, M, E0) con una parte de front. Se entrega en **dos PRs**: **RGB-2a** (servidor: verificación del token de Supabase Auth, usuarios invitados, doble factor, contexto real) y **RGB-2b** (pantalla de acceso, sesión, 2FA y cierre de sesión). Después viene RGB-4 (roles por proyecto y función central `can`). Flujo: contrato primero, Escritor de tests, Desarrollador, Tester, Juez, PR.

Fuente: página RGB-2 del Backlog de Notion. Hoy toda petición corre como un usuario y un estudio ficticios (`request_context` en `backend/app/api/dependencies.py`) y la API es pública.

## Criterios de aceptación

- [ ] Un usuario invitado entra con su cuenta y queda asociado a su estudio.
- [ ] Un usuario no invitado no puede entrar.
- [ ] Tests de autenticación y de rechazo.
- [ ] Doble factor obligatorio para socio, director y administración.

## Diseño

**Proveedor de identidad: Supabase Auth** (el proyecto ya es Supabase) con Google y Microsoft. El navegador inicia sesión con Supabase y manda el `access_token` (JWT) a la API en `Authorization: Bearer`. La API **no guarda contraseñas ni habla con Google/Microsoft**: solo verifica el JWT.

1. **Verificación del JWT** en infraestructura (puerto `TokenVerifier` en el dominio): firma ES256 con las claves públicas del proyecto (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, con caché y reintento manual al rotar la clave), `iss = {SUPABASE_URL}/auth/v1`, `aud = authenticated`, `exp`/`nbf`. Se extraen `sub`, `email` (verificado) y `aal` (nivel de aseguramiento: `aal1` o `aal2`). Nada de `alg: none` ni HS256 aceptado.
2. **Usuarios del estudio e invitaciones** (`study_members`): una fila por persona y estudio con `email` (en minúsculas), `role`, `qualifications`, `status` (`invited` / `active` / `revoked`), `user_id` (el `sub`, se rellena al aceptar), quién invitó y cuándo. Única por (`study_id`, `email`). RLS por estudio. Solo entran personas con una fila `invited` o `active`; la primera vez que entran con ese email verificado, la fila pasa a `active` y se enlaza al `sub`.
3. **Resolución sin conocer aún el estudio:** una función SQL `SECURITY DEFINER` (`resolve_member(email, sub)`) devuelve estudio, rol y cualificaciones y activa la invitación; es la única forma de saltarse la RLS y solo devuelve la fila de ese email.
4. **Doble factor:** socio, director y administración exigen `aal2`; con `aal1` la API responde 403 `mfa_required`. Los demás roles entran con `aal1`.
5. **Contexto real:** `request_context` lee el token y arma el `RequestContext` desde la fila de `study_members`. Sin token o con token inválido, 401 `unauthenticated`; con token válido pero sin invitación, 403 `not_invited`; revocado, 403 `member_revoked`.
6. **Invitar:** `POST /api/members/invitations` (`{email, role, qualifications?}`), solo socio o director; `GET /api/members` lista el estudio; `POST /api/members/{id}/revoke`. Cada invitación, activación y revocación queda en la auditoría (el rechazo `not_invited` no, porque aún no hay estudio).
7. **Modo de autenticación configurable:** `AUTH_MODE=dev|supabase`. **Por defecto `dev`** (comportamiento actual) para no romper producción al desplegar el código; el cambio a `supabase` en Cloud Run es una decisión consciente posterior (requiere activar los proveedores y crear al primer socio). `dev` no se admite si `ENVIRONMENT=production` y `AUTH_MODE` no se ha fijado a propósito: la API arranca en `dev` solo con `AUTH_MODE=dev` explícito o sin variable (aviso en el registro).
8. **Primer socio (arranque):** el primero no puede invitarse a sí mismo. Script manual `python -m backend.app.shared.bootstrap_member --study <id> --email <email> --role partner` (idempotente), ejecutado por la persona responsable; nunca automático.
9. **Rol «Administración»** pasa a ser un valor del enum `Role` (hoy faltaba) para poder exigirle doble factor; su autoridad de promoción no cambia (RGB-4 decide el resto).

## Fuera de alcance

- Configurar los proveedores Google y Microsoft en el panel de Supabase y crear sus credenciales OAuth (lo hace la persona responsable; se documenta cómo).
- Pantalla de acceso, sesión en el navegador, alta del 2FA y cierre de sesión (RGB-2b).
- Roles por proyecto y función `can` (RGB-4).
- Quitar el modo `dev`.

## Archivos (RGB-2a)

**Back** (`backend/`)
- `migrations/010_study_members.sql`: tabla, RLS, función `resolve_member`.
- `app/study/domain/`: `Role.ADMINISTRATION`, `Member`, errores (`Unauthenticated`, `NotInvited`, `MemberRevoked`, `MfaRequired`), reglas de doble factor (`requires_mfa(role)`), puertos `TokenVerifier` y `Members`.
- `app/study/application/`: `Authenticate` (token → contexto) e `ManageMembers` (invitar, listar, revocar, con auditoría).
- `app/study/infrastructure/`: `SupabaseJwtVerifier` (PyJWT + JWKS), `PostgresMembers`.
- `app/api/`: `request_context` según `AUTH_MODE`, `member_routes.py`, `dependencies.py`, manejo de errores `{detail:{code,message}}`.
- `app/shared/bootstrap_member.py`, `config.py` (`auth_mode`, `supabase_url`), `requirements.txt` (`PyJWT[crypto]`).
- `tests/`: dominio puro, casos de uso con `create_autospec`, verificador con **claves ES256 generadas en el test y un JWKS simulado** (sin red), rutas, Postgres real (RLS, `resolve_member`, activación), auditoría, arquitectura y un test de que `AUTH_MODE=supabase` rechaza peticiones sin token en todas las rutas de negocio.

**Docs:** `docs/despliegue.md` (cómo activar Google y Microsoft en Supabase, variables `AUTH_MODE` y `SUPABASE_URL`, primer socio), `docs/estado.md`, `implementation_log.md`, Notion y el artifact.

## Supuestos provisionales

1. Supabase Auth es el proveedor; no se construye otro sistema de contraseñas.
2. El doble factor lo gestiona Supabase (TOTP); la API solo comprueba el nivel `aal2` del token.
3. Un email pertenece a un solo estudio en el MVP.
4. Los datos de prueba son ficticios (emails `@example.com`, ids sintéticos).
