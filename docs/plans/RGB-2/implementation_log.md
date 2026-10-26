# RGB-2a · Registro del Tester

Rama `feat/RGB-2-auth-back` (sin commit). Verificación de punta a punta de la parte de servidor contra un **uvicorn real** con `AUTH_MODE=supabase` y `SUPABASE_URL=http://127.0.0.1:9100`, un servidor JWKS de juguete local (clave ES256 generada por el Tester; sirve `/auth/v1/.well-known/jwks.json`, cuenta las descargas y puede publicar una segunda clave) y el Postgres local `back-db-1` (54329). Los tokens de prueba llevan `iss = {SUPABASE_URL}/auth/v1`, `aud = authenticated`, `sub`, `email`, `email_verified` y `aal`. Solo local: nada de Supabase real, Cloud Run, Google ni `.mcp.json`. Datos ficticios (`@example.com`). El Tester no tocó código de producción ni de tests. Veredicto del Juez: pendiente.

## Qué se hizo

- Migración `010_study_members.sql` aplicada con `python -m backend.app.shared.migrate` (`.venv-back`).
- Uvicorn en el 8010 (`AUTH_MODE=supabase`), más instancias efímeras para los arranques (dev sin variables, dev + `ENVIRONMENT=production`, supabase sin URL, JWKS caído).
- Conexiones a la BD observadas con `pg_stat_database.sessions` (delta de sesiones abiertas antes y después de una ráfaga de peticiones).
- Estudios: A = `...e001`, B = `...e002` y estudios de carrera `...f00NN` creados a mano con SQL (solo la fila de `studies`).
- Cifras: `ruff check backend` limpio; `pytest backend` sin `DATABASE_URL`: **1363 pasan + 455 omitidos = 1818** (los omitidos son los de Postgres real). Con `DATABASE_URL=postgresql://rgb:rgb@localhost:54329/rgb`: **1818 pasan, 0 omitidos** (4 min 47 s).

## Criterios

| Criterio | Resultado |
|---|---|
| Un usuario invitado entra con su cuenta y queda asociado a su estudio | **Cumple.** `bootstrap_member` crea la invitación del primer socio (email normalizado `ana.partner@example.com`, `invited_by=bootstrap`, auditada); la segunda ejecución responde «Ya existía» sin duplicar fila ni evento. Primer inicio con `aal2`: la fila pasa a `active`, `user_id = sub`, un solo evento `activate`; un segundo inicio no activa otra vez. Estudio inexistente y email inválido: salida 1 con mensaje. |
| Un usuario no invitado no puede entrar | **Cumple.** Token válido de un email sin fila: 403 `not_invited`. Mismo email con otro `sub` (cuenta ya activa): 403 `not_invited`. Un `sub` ya enlazado con un email distinto: 403 `not_invited`. |
| Doble factor obligatorio para socio, director y administración | **Cumple.** Socio con `aal1`: 403 `mfa_required` y la invitación **sigue** `invited` sin `user_id` ni evento `activate` (la transacción se revierte). Director con `aal1`: 403 `mfa_required`. Director de proyecto y arquitecto entran con `aal1` (200). (Administración: cubierta por los tests de dominio; no se activó una cuenta de administración a mano.) |
| Tests de autenticación y de rechazo | **Cumple.** Ver cifras. |

## Verificación del token (siempre 401 `unauthenticated`, sin 500, sin abrir conexión)

Caducado; firma ajena con `kid` conocido; `alg: none` (con y sin `kid`); HS256 firmado con la clave pública como secreto (PEM, coordenada `x` y JWK en JSON); `RS256`; sin `kid`; `kid` desconocido; `iss` ajeno; `aud` distinto; sin `exp`; `nbf` futuro; sin `sub`; sin `email`; `not.a.jwt`; `aaaa`; token de 5000 caracteres; sin `Authorization`; `Basic`; `bearer` en minúsculas con token caducado; `Bearer ` vacío; `Bearer` solo; esquema `Token`; `Bearer Bearer <t>`; `Bearer <t> <t>`. Todos 401 con `WWW-Authenticate: Bearer`.

- **Cero conexiones:** 100 peticiones con token inválido (basura, 5 KB, caducado, `kid` desconocido, email sin verificar) abrieron **0** sesiones en Postgres. Una petición válida abre 2 (identidad + miembros), un `not_invited`, 1.
- **Email sin verificar** (`email_verified: false`): 403 `email_not_verified`, también sin tocar la BD.
- **Cabecera gigante** (más de 64 KB): uvicorn la corta con 400 antes de la aplicación; sigue vivo. 50 KB: 401.
- **`kid` desconocido y recarga del JWKS:** token con `kid k2` antes de publicarlo: 401 y una descarga; 60 tokens con `kid` aleatorios: **1** descarga más (enfriamiento de 30 s). Tras publicar `k2` el mismo token sigue en 401 durante el enfriamiento y pasa a 200 pasado este; el `kid` ajeno sigue en 401 y `k1` sigue en 200.
- **JWKS caído** (instancia nueva con una URL sin servidor): 401, 0 conexiones a la BD, aviso en el registro («Could not load the Supabase JWKS: URLError»), sin 500.

## Rutas de negocio y arranque

- Las **52** combinaciones (26 operaciones de `/openapi.json` × sin cabecera y `Bearer junk`) devuelven 401, salvo `/api/health` (200, público). Con cuerpo vacío o inválido el 401 gana a la validación.
- `AUTH_MODE` no definido (`env -i`): arranca en modo dev y responde con el contexto ficticio (sin token). Con `ENVIRONMENT=production` avisa en el registro («AUTH_MODE=dev in production…»), tanto sin variable como con `AUTH_MODE=dev` explícito. En `supabase` + producción no avisa.
- `AUTH_MODE=supabase` sin `SUPABASE_URL` o con solo espacios: la API **no arranca** (error de validación, también con uvicorn real). `AUTH_MODE=Supabase2` y `AUTH_MODE=` vacío: no arrancan.
- **CORS:** preflight `OPTIONS /api/members` desde `http://localhost:3000` con `Access-Control-Request-Headers: authorization,content-type`: 200 con `allow-origin` y `allow-headers` correctos. Origen ajeno: 400 sin `allow-origin`. Un 401 real lleva `access-control-allow-origin` y `www-authenticate: Bearer`.

## Invitaciones, roles y revocación

- Socio invita a director, director de proyecto, arquitecto (con la cualificación `sponsor`) y administración: 201. Duplicado: 409 `member_already_exists`.
- Director de proyecto y arquitecto que invitan: 403 `no_authority` (pueden listar: 200). Director: invitar socio, director o administración, dar cualificaciones, revocar a un socio o a un director: todos 403 `no_authority` con el mensaje del plan; invitar arquitecto sin cualificaciones: 201; revocar arquitecto: 200.
- **Auditoría** (`audit_events`, entidad `member`): `invite`, `activate`, `revoke` con `outcome ok`, y cada rechazo con `outcome rejected` (cinco rechazos del director y el de `last_partner`). `not_invited` no se audita (como dice el plan).
- Revocado que entra: 403 `member_revoked`. Re-invitar a un revocado: 409 (no hay forma de reactivar; ver hallazgos).
- **Último socio:** revocarse a sí mismo siendo el único activo: 409 `last_partner` (también si el otro socio solo está invitado). Revocar una invitación pendiente de socio: 200, y repetirlo: 200 (idempotente).
- **Carrera de dos socios que se revocan entre sí:** 8 estudios, dos peticiones simultáneas con barrera en cada uno: en los 8 una da 200 y la otra 409 `last_partner`, y quedó **un** socio activo (nunca cero).
- **Dos tokens simultáneos del mismo invitado nuevo:** 6 rondas con 4 peticiones simultáneas con el mismo `sub`: las 4 dan 200 y hay **un** solo evento `activate`. Con dos `sub` distintos para el mismo email: gana uno (2 × 200) y el otro recibe 403 (2 × 403), un solo `activate`, `user_id` del ganador.
- **Estudios aislados:** Bruno (B) solo ve su estudio; Ana (A) no ve a Carla (B); revocar un miembro de B desde A: 404 `member_not_found`; A no ve eventos de auditoría de B (0). Las cabeceras `X-Study-Id` y `X-Forwarded-For` se ignoran. `GET /api/members` expone `id, email, role, qualifications, status` y **no** `user_id`.
- **RLS en Postgres** (como `rgb_app`): sin estudio, 0 filas; con estudio A, solo las suyas; `UPDATE` de `role` y `DELETE`: `permission denied`; insertar una fila de otro estudio: violación de RLS; `resolve_member` con un email inexistente o `%`: 0 filas. `rgb_app` y `rgb_member_resolver` sin superusuario ni `BYPASSRLS` (el usuario local `rgb` sí es superusuario, como siempre en este entorno).

## Intentos de romperlo

| Intento | Resultado |
|---|---|
| Inyección SQL en el email (`a'; drop table…--@example.com`, `' OR '1'='1`) | 422 `invalid_email`; tabla intacta |
| Mayúsculas y espacios (`  UPPER.Case@EXAMPLE.com `, y en el token `  ANA.PARTNER@EXAMPLE.COM  `) | Se normalizan; el inicio de sesión encuentra la fila |
| `\n` final | Se recorta (409 por duplicado) |
| `+alias` | Es otra dirección: `ana.partner+alias@…` se invita y activa por separado; no hereda nada de `ana.partner@…` (sin escalada) |
| Homógrafos (a cirílica, `ａ` ancha, punto `U+2024`) | Se aceptan como direcciones distintas; solo entra quien tenga ese email verificado exacto |
| Espacios, doble `@`, vacío, `null`, número | 422 |
| `sub` repetido en otra cuenta | 403 `not_invited` (ver nota del hallazgo 4) |
| Campos extra (`status`, `user_id`) en la invitación, cualificación o rol inventados, cuerpo no JSON | 422 `invalid_request` |
| Carácter NUL en el email | **500** (hallazgo 1) |

## Hallazgos

1. **Media-baja · Un carácter NUL en el email da 500 y, en el rechazo, pierde la auditoría.** Reproducción: con el token de un socio, `POST /api/members/invitations {"email":"a\u0000b@example.com","role":"architect"}` → 500 (`psycopg.DataError: PostgreSQL text fields cannot contain NUL`). Con el token de un director de proyecto (sin autoridad) y `"email":"a\u0000@example.com"` → 500 en lugar de 403 `no_authority`, porque el rechazo intenta auditar con ese `entity_id`. Con un token **firmado** cuyo `email` lleve NUL, `GET /api/members` → 500. `normalize_email` no lo rechaza. Solo lo alcanza una persona autenticada (el caso del token exige un token válido que Supabase no emitiría), pero rompe el contrato «nunca 500». Arreglo sugerido: rechazar `\x00` (y caracteres de control) en `normalize_email`/`_EMAIL`, y sanear el `entity_id` de la auditoría de rechazos.
2. **Baja · El email no tiene longitud máxima.** Se aceptaron invitaciones con emails de 5000 y 200 000 caracteres (201). RFC 5321: 254. Un socio o director puede inflar `study_members` y la auditoría. Sugerido: límite de 254 en dominio y `CHECK` en la tabla.
3. **Baja · El rechazo auditado guarda el email completo como `entity_id` y no dice el motivo.** Las filas `invite … rejected` llevan el correo escrito por el actor en `entity_id` y `new_value` vacío: no se sabe si fue `no_authority` por rol, por cualificación o `last_partner`, ni qué rol se intentó. Sugerido: `new_value` con `{reason, requested_role}`.
4. **Baja · «Un email pertenece a un solo estudio» no se impone.** El índice único es `(study_id, lower(email))`, así que el mismo email se puede invitar en A y en B (201 en ambos), pero `resolve_member` elige una sola fila por email (`ORDER BY revoked, invited_at LIMIT 1`): gana la primera invitación y la otra nunca se activa. Además, un socio de A puede «adelantarse» e invitar el email que B va a invitar. Sin impacto con un solo estudio real; con varios, decidir (índice único global por email o resolver por estudio). Nota relacionada: `resolve_member` busca solo por email, así que un token con un `sub` ya enlazado a otra fila pero con el email de una invitación pendiente la activa y enlaza el mismo `sub` a dos filas; Supabase vincula un `sub` a un solo email, por lo que hace falta un token forjado.
5. **Baja · Un JWKS inaccesible se ve como 401.** Con el servidor de claves caído, todos los usuarios reciben 401 `unauthenticated` (cierre de sesión aparente) en lugar de 503; queda un aviso en el registro. Aceptable en el MVP; conviene una alerta.
6. **Baja · Una clave rotada tarda hasta 30 s en aceptarse.** Con el enfriamiento de recarga, un token firmado con una clave recién publicada recibe 401 durante ese margen. Es el compromiso buscado contra el abuso por `kid` falsos.
7. **Baja · No se puede reactivar a un revocado.** Re-invitar su email da 409 `member_already_exists` y no hay ruta de reactivación; quien se equivoque al revocar necesita SQL manual.
8. **Info · `/openapi.json` y `/docs` son públicos** en modo `supabase` (exponen el esquema, no datos). Los homógrafos y el `+alias` se aceptan en la invitación sin aviso. Cualquier miembro (incluido colaborador de obra) puede listar los emails del estudio con `GET /api/members`.
9. **Info · Dos avisos al arrancar en producción en dev:** el módulo crea `app = create_app()` y los scripts que importan y llaman a `create_app` lo repiten. Sin impacto.

Sin bloqueantes: no se encontró forma de entrar sin invitación, de saltar el doble factor, de escalar roles, de leer otro estudio ni de dejar un estudio sin socio.

## No verificado

- **Google real** y el flujo OAuth: no hay front ni proveedor configurado; solo se probó la verificación del JWT.
- **Doble factor real de Supabase (TOTP, `aal2`)**: se simuló con el claim `aal`. No se comprobó que Supabase emita `aal2` ni que el token se renueve tras alta del segundo factor.
- **Forma real de los claims de Supabase** (`email_verified` raíz frente a `user_metadata`, `kid` y `alg` de sus claves, `iss` exacto): se usó un servidor de juguete con el formato documentado.
- **Producción / Cloud Run / Supabase real**: no se tocó; tampoco el cambio de `AUTH_MODE` allí.
- **Rol `rgb_member_resolver` en Supabase**: en local se crea con el usuario `rgb` (superusuario). Falta comprobar que la migración 010 corre con los permisos de Supabase (`CREATE ROLE`, `GRANT … TO current_user`, `ALTER FUNCTION … OWNER TO`).
- **Colación de `lower()`** de Postgres en Supabase frente a la local para emails no ASCII.

## Limpieza

Procesos levantados (uvicorn 8010–8015 y servidor JWKS 9100) detenidos al terminar. Quedan en la BD local datos ficticios de prueba (`@example.com`, estudios `...f00NN`) en `back-db-1`; las tablas de `study_members` y auditoría de los estudios de prueba no se borraron (RLS forzada y auditoría de solo añadir).

## Veredicto del Juez

**APROBADO** (RGB-2a, servidor), con dos condiciones de cierre que no tocan el código: documentar en `docs/despliegue.md` y no commitear `.mcp.json` (ver abajo).

### Cifras propias del Juez

- `ruff check backend`: limpio.
- `pytest backend -q` con `DATABASE_URL=postgresql://rgb:rgb@localhost:54329/rgb` (back-db-1, `.venv-back`): **1853 pasan, 0 omitidos, 0 fallos** (5 min 38 s). El log del Tester dice 1818; la diferencia (+35) son los tests añadidos tras corregir sus hallazgos 1 a 3.

### Criterios de Notion

- Invitado entra y queda asociado a su estudio: cumple (`resolve_member` activa, enlaza `sub`, el contexto sale de la fila; probado con Postgres real y de punta a punta por el Tester).
- No invitado no entra: cumple (403 `not_invited`; también con otro `sub` sobre una fila ya enlazada).
- Tests de autenticación y de rechazo: cumple (verificador, casos de uso con `create_autospec`, rutas, migración/RLS, conexión, modos).
- Doble factor para socio, director y administración: cumple (`requires_mfa` + `aal2`, 403 `mfa_required`, transacción revertida sin activar). El criterio «Google y Microsoft» queda parcial por decisión documentada (solo Google); seguimiento.

### Seguridad (revisada en código y tests)

- Verificación del JWT: solo `ES256` (cabecera comprobada y `algorithms=["ES256"]`), `kid` obligatorio, `iss`, `aud=authenticated`, `exp`, `sub`, `email` obligatorios, `nbf` validado, email verificado exigido (raíz o `user_metadata`, exactamente `true`). `alg: none`, HS256 con clave pública y RS256 cubiertos por tests. JWKS cacheado por `kid`, recarga ante `kid` desconocido con enfriamiento de 30 s, claves no ES256 descartadas, cualquier fallo del JWKS es 401 (falla cerrado) con aviso en el registro.
- Token antes que conexión: `check_token` corre antes de `identity_transaction`; test con la fábrica de conexión simulada.
- Todas las rutas de negocio exigen token en `supabase`: la dependencia `request_context` está en todas; hay un test que recorre `openapi()` (sin token, basura, firma ajena, caducado) y el Tester comprobó 52/52 contra uvicorn real. Solo `/api/health` y CORS preflight son públicos (y `/docs`/`openapi.json`, información sin datos).
- Modo dev: sigue por defecto (decisión del plan, para no romper producción al desplegar). Aviso en el registro con `ENVIRONMENT=production`, probado. `supabase` sin `SUPABASE_URL` no arranca.
- `resolve_member`: `SECURITY DEFINER`, `search_path` fijado (`<schema>, pg_temp`), propietario `rgb_member_resolver` (NOLOGIN, solo SELECT/UPDATE sobre `study_members` y USAGE del esquema), `EXECUTE` revocado a PUBLIC y concedido solo a `rgb_app`. Consulta con parámetros, solo devuelve la fila de ese email (`=`, no `LIKE`), `FOR UPDATE` evita la doble activación, no entrega filas `active` de otro `sub`. Sin vía de enumeración (un email revocado revela «revocado» solo a quien presenta ese email verificado).
- `rgb_app`: sin UPDATE/DELETE/TRUNCATE salvo columnas `status, revoked_at`; RLS forzada por estudio; el rol del resolvedor sin LOGIN.
- Escalada: director no invita ni revoca socio/director/administración; solo el socio concede cualificaciones; roles distintos de socio/director no gestionan. Reglas en dominio puro y probadas, rechazos auditados.
- Último socio y concurrencia: `SELECT ... FOR UPDATE` ordenado por id; el Tester lo probó con carreras reales (8 de 8 estudios con un socio activo al final).
- Hallazgos 1, 2 y 3 del Tester, verificados corregidos: `normalize_email` rechaza NUL, sustitutos sueltos y más de 254 caracteres (también el verificador, que lo trata como 401); las auditorías de rechazo ya no guardan el email (`entity_id` fijo `invitation` o el uuid del miembro, `new_value` con `role` y `error`); sin `user_id` ni email en los rechazos. Hay tests para cada caso.
- Auditoría de invitar/activar/revocar y de los rechazos con estudio: presente. `not_invited` no se audita (no hay estudio), según el plan.

### Reglas de CLAUDE.md

- DDD: `study/domain` sin jwt/psycopg/fastapi/pydantic (test de arquitectura que lo vigila, más capa de aplicación y adaptadores solo en `api/dependencies.py`). TDD: hay tests en cada capa. Tests existentes tocados (`test_context.py`: añade `administration` al conjunto de roles, justificado por el plan; `test_config.py` y `test_architecture.py`: solo se añaden casos): ninguno debilitado. `opportunity/domain/text.py` ahora reexporta `shared.text.is_storable`: refactor sin cambio de comportamiento.
- Código en inglés, mensajes de usuario en español, datos ficticios (`@example.com`). Ninguna acción de IA cambia estados.

### Riesgos residuales y seguimientos (ninguno bloqueante)

1. **Migración 010 en Supabase (acción para la persona responsable, antes de pasar a `AUTH_MODE=supabase`).** Usa `CREATE ROLE`, `GRANT <rol> TO current_user` y `ALTER FUNCTION ... OWNER TO rgb_member_resolver`. En local pasa porque `rgb` es superusuario; en Supabase `postgres` no lo es. Riesgos: (a) `ALTER FUNCTION ... OWNER` exige que el nuevo propietario tenga `CREATE` sobre el esquema, y la migración solo le da `USAGE`: es probable que falle en Supabase con «permission denied for schema»; (b) `CREATE ROLE` necesita `CREATEROLE`, que `postgres` suele tener; (c) si se arregla con `GRANT CREATE ON SCHEMA`, hay que revocarlo en la misma migración para no dejar al propietario crear objetos. La migración corre en una transacción: un fallo es ruidoso y no deja nada a medias. Probarla primero en una rama de Supabase (branching) y aplicarla antes de cambiar el modo. No se pudo verificar aquí.
2. **Documentación pendiente (condición de cierre).** `docs/despliegue.md` aún no explica cómo activar Google en Supabase (credenciales OAuth, URL de redirección), `AUTH_MODE`, `SUPABASE_URL`, `ENVIRONMENT` ni el primer socio (`bootstrap_member`); lo prometen el plan y `.env.example`. Debe estar en el PR o, como mínimo, anotado como tarea previa al cambio de modo. También `docs/estado.md`, Notion y artifact al cerrar, según CLAUDE.md.
3. **`.mcp.json` sin seguir y sin ignorar** (contiene el project_ref de Supabase, sin secreto). No forma parte del cambio: no debe entrar en el commit (usar `git add` por rutas, no `-A`) o añadirlo a `.gitignore`.
4. Un mismo email en dos estudios: no se impide (el índice es por estudio) y `resolve_member` toma una sola fila; contradice el supuesto 3 del plan. Sin impacto con un estudio; decidir índice único global o resolución por estudio antes de multi-estudio. Relacionado: un `sub` ya enlazado con otro email podría activar una segunda invitación, solo con un token forjado.
5. `rgb_app` puede actualizar `status` de `study_members` (necesario para revocar): un fallo de inyección SQL en la API podría reactivar un revocado. Defensa en profundidad pendiente: trigger que solo admita `active/invited -> revoked`.
6. Sin reactivación de un revocado (hace falta SQL manual) y sin ruta para reinvitar; JWKS caído se ve como 401 (conviene alerta); clave recién rotada tarda hasta 30 s; el listado de miembros lo ve cualquier rol; `/docs` y `openapi.json` públicos; doble aviso de producción al arrancar. Informativos.
7. Google real, `aal2` real de Supabase (TOTP), forma exacta de los claims (`email_verified`, `kid`, `iss`) y la colación de `lower()` en Supabase no están verificados: comprobarlo en la prueba de RGB-2b con un proyecto real antes de activar `supabase` en Cloud Run.
8. Microsoft queda pendiente (criterio de Notion parcial).

---

## RGB-2b · Registro del Tester (front)

Rama `rgb-2b-acceso`. Verificación con el **build real** (`next build` + `next start`, Node 20, Chrome vía Playwright, `es-ES`, claro y oscuro, axe-core sin violaciones en cada pantalla). Datos ficticios (`ana.partner@example.com`). No se tocó código de producción. Los scripts y el servidor simulado viven fuera del repo (scratchpad de la sesión).

### Qué fue real y qué simulado

| Parte | Real | Simulado |
| --- | --- | --- |
| Build de Next, `proxy.ts`, rutas, componentes, CSS, `@supabase/ssr` y `@supabase/supabase-js` (servidor y navegador) | Sí | |
| Modo `dev` (sin variables) | Sí (build y servidor reales) | |
| Modo `supabase` con `https://example.supabase.co` y clave `dummy` | Sí: redirecciones, `/login`, avisos, `/auth/callback` | Sin red a Supabase (no hay sesión) |
| Supabase Auth | | Servidor local mínimo (`/auth/v1/.well-known/jwks.json`, `user`, `factors`, `challenge`, `verify`, `logout`) que firma tokens ES256 propios; el `proxy` verifica de verdad la firma con ese JWKS. Código TOTP válido: `123456` |
| API (`GET /api/me`, `/api/portfolio`) | | Mismo servidor local; `/api/portfolio` devuelve cartera vacía |
| Sesión | | Cookie `sb-127-auth-token` fabricada con el formato de `@supabase/ssr` |
| Código QR de `mfa-enroll-*` | | Dibujo de relleno (no escaneable); la clave secreta también es ficticia |
| Google (consentimiento), `aal2` real, claims reales | **No verificado** | |

### Pantallazos (`screenshots-2b/`, sufijos `-light` y `-dark`)

| Archivo | Muestra | Origen |
| --- | --- | --- |
| `dev-portfolio-unchanged-*` | Cartera en modo `dev`: sin cabecera nueva ni «Cerrar sesión» | Real |
| `login-*` | `/login` con «Entrar con Google» | Real (build `supabase`) |
| `login-error-not-invited-*` | Aviso «No tienes invitación…» con foco en el aviso | Real |
| `login-error-member-revoked-*` | Aviso «Tu acceso ha sido retirado…» | Real |
| `login-error-email-not-verified-*` | Aviso de correo no verificado | Real |
| `mfa-enroll-*` | Alta del TOTP: QR, clave y campo de 6 dígitos | Real + Supabase simulado |
| `mfa-error-*` | Código incorrecto: aviso, campo vacío y con foco | Real + Supabase simulado |
| `mfa-verify-*` | Verificación con un factor ya activo | Real + Supabase simulado |
| `topbar-with-account-*` | Cabecera con correo, rol «Socio» y «Cerrar sesión» | Real + API y sesión simuladas |
