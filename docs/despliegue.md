# Despliegue

Front en Vercel, backend en Google Cloud Run (capa gratuita, región de EE. UU.) y base de datos en Supabase.

> **Aviso de datos.** El README fija la base de datos en la UE (Supabase). Con la API en EE. UU. cada consulta cruza el Atlántico (~100 ms) y los datos de proyectos pasan por EE. UU. Aceptable para una demo con datos ficticios; antes de usar datos reales hay que decidir si es compatible con el RGPD o mover la API a `europe-west1` (deja de ser gratuito, pero cuesta céntimos con este tráfico). Comprueba también en la página de precios de Cloud Run qué regiones entran en la capa gratuita.

## 1. Base de datos (Supabase)

1. Crea el proyecto (región UE). Guarda la contraseña de la base de datos; si lleva símbolos (`@`, `/`, `:`, `#`, espacios) rompe la URL, así que usa una de solo letras y números.
2. Copia la cadena del **pooler en modo sesión** (*Project Settings → Database → Connection string → Session pooler*, puerto 5432, usuario `postgres.<ID-del-proyecto>`). Sirve tanto para migrar como para la API. No uses la conexión directa (`db.<ID>.supabase.co`): en el plan gratuito solo responde por IPv6, que muchas redes y Cloud Run no tienen. El modo transacción también sirve para la API, porque `SET LOCAL ROLE` y `set_config(..., true)` viven dentro de la transacción.
3. Aplica las migraciones desde tu máquina, con la contraseña por entrada interactiva (zsh; en bash, `read -rs -p "Contraseña: " PW`):

   ```bash
   python3 -m venv .venv-back && .venv-back/bin/pip install -r requirements.txt
   read -rs "PW?Contraseña: "; echo
   DATABASE_URL="postgresql://postgres.<ID>:${PW}@<host-del-pooler>:5432/postgres" \
     .venv-back/bin/python -m backend.app.shared.migrate; unset PW
   ```

   Salida esperada: la lista de migraciones nuevas (`001_baseline.sql` … `008_scoring.sql` en una base vacía; `ninguna` si ya está al día). Probado contra Supabase (2026-10-24): `002_multistudy.sql` (rol `rgb_app` y `GRANT`) se aplica sin problemas. Ejecútalo en una terminal normal: dentro de Claude Code, `!` no da entrada interactiva y la contraseña llega vacía.
4. Plan gratuito: Supabase **pausa el proyecto tras una semana sin actividad**. Reactívalo desde el panel o programa un ping que haga una consulta (`/api/health` no toca la base).

## 2. Backend (Cloud Run)

Requisitos: proyecto de Google Cloud con facturación activada (la capa gratuita lo exige) y `gcloud` instalado.

```bash
PROYECTO=<id-del-proyecto>
REGION=us-central1   # también us-east1 o us-west1

gcloud config set project $PROYECTO
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com

# Secreto con la conexión a la base de datos
printf '%s' 'postgresql://...' | gcloud secrets create database-url --data-file=-

# Primer despliegue (construye con backend/Dockerfile)
gcloud run deploy rgb-api \
  --source backend \
  --region $REGION \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 2 \
  --memory 512Mi --cpu 1 \
  --set-secrets DATABASE_URL=database-url:latest \
  --set-env-vars CORS_ORIGINS=https://<dominio-de-vercel>
```

Dale a la cuenta de servicio de Cloud Run el rol `Secret Manager Secret Accessor`. La URL resultante (`https://rgb-api-….run.app`) es el valor de `NEXT_PUBLIC_API_URL` en Vercel.

Comprobación: `curl https://rgb-api-….run.app/api/health` → `{"status":"ok"}`.

### Migraciones

La imagen **no** migra al arrancar: con escala a cero cada arranque en frío las repetiría. Se aplican en un Cloud Run Job con la misma imagen, antes de cada despliegue:

```bash
gcloud run jobs deploy rgb-migrar \
  --source backend --region $REGION \
  --command python --args=-m,backend.app.shared.migrate \
  --set-secrets DATABASE_URL=database-url:latest
gcloud run jobs execute rgb-migrar --region $REGION --wait
```

El secreto `database-url` apunta al pooler en modo sesión, el mismo que se usó para migrar a mano.

### Notas

- Escala a cero: la primera petición tras un rato sin uso tarda 1–3 s. `--min-instances 1` lo evita, pero deja de ser gratis.
- Mientras no exista autenticación (RGB-2) la API usa un estudio y usuario ficticios (`DEV_ESTUDIO_ID`, `DEV_USUARIO_ID`). No publiques endpoints de negocio ni datos reales hasta tenerla.
- **Estudio ficticio de desarrollo.** Las escrituras de la API (por ejemplo `PUT /api/settings/plan/...`) necesitan que exista la fila de `studies` con el id `DEV_STUDY_ID` (por defecto `00000000-0000-0000-0000-00000000e001`); sin ella la clave foránea falla. En local la siembra `bash scripts/dev.sh` con `python -m backend.app.shared.seed_dev` (idempotente, nombre «Estudio de desarrollo»). No es una migración a propósito: producción y Supabase no la reciben, y el script se niega a correr contra un host que no sea local salvo con `--force`. Cuando llegue la autenticación (RGB-2) los estudios reales se crearán por su propio flujo.
- Topes de los ajustes del plan: semanas enteras entre 1 y 520 (7 valores) y factor de escala entre 0,1 y 10; fuera de rango la API responde 422 con `{detail:{code,message}}` (`invalid_weeks`, `invalid_factor`). Cualquier otra petición mal formada responde 422 con `code: "invalid_request"` (no el `detail` en lista de FastAPI).
- El Dockerfile y las dependencias de Python viven en `backend/`; el contexto de construcción es esa carpeta. `railway.toml` (primera opción, Railway) se eliminó.

## 3. Front (Vercel)

1. Importa el repositorio; en *Root Directory* pon `frontend`. No hace falta `vercel.json`.
2. Variable de entorno `NEXT_PUBLIC_API_URL` = URL de Cloud Run, fijada en los entornos de producción y de preview (ya está fijada con el valor de Cloud Run). En local se define en `frontend/.env.local` (ver `frontend/.env.example`). Al ser `NEXT_PUBLIC_*`, Next.js la incrusta en el build: si cambia, hay que redesplegar el front para que surta efecto.
3. Añade el dominio de Vercel (y los de preview que uses) a `CORS_ORIGINS` en Cloud Run, separados por comas:
   `gcloud run services update rgb-api --region $REGION --update-env-vars ^@^CORS_ORIGINS=https://a.vercel.app,https://b.vercel.app`
4. `next/font/google` necesita red en el build; en Vercel la hay. Pasar a fuentes locales sigue pendiente (ver [estado](estado.md)).

Hoy el front llama a la API en `/settings`, `/portfolio`, `/projects`, `/opportunities/new`, «Plan y tiempos» (pausas) y `/projects/[code]/scoring`; el resto sigue con datos de ejemplo.

## Puesta al día: migraciones 006–008 y backend (hecha el 2026-10-25)

Estaba pendiente: producción tenía migradas la 001–005 y el backend anterior, y `main` añade `006_opportunities`, `007_pauses` y `008_scoring`. Queda hecha así:

- **Migraciones:** aplicadas en Supabase con el MCP (`apply_migration`, una por una y en orden) y registradas a mano en `schema_migrations` (`006_opportunities.sql`, `007_pauses.sql`, `008_scoring.sql`) para que el migrador del repo no las repita. No se usó el Job `rgb-migrar`.
- **Backend:** `gcloud run deploy rgb-api --source backend --region us-central1` desde la rama `docs/deploy-checklist` (commit `c1a59ec`, que no cambia código del backend respecto de `main`). Revisión nueva `rgb-api-00004-zp6` con el 100 % del tráfico; la anterior, `rgb-api-00003-5xn`. Se conservaron secretos y variables.
- **Comprobado (solo lectura):** `/api/health` 200 `ok`; `/api/portfolio` 200 con `projects` vacío; `/api/settings/scoring` 200 con los pesos por defecto (todos 1.0, umbral 60); `/api/projects/PRY-0000-000/pauses` 404 con `{detail:{code:"project_not_found",…}}`. No se lanzó ningún `POST`/`PUT`.
- **Sin hacer a propósito:** la siembra del estudio ficticio (paso 3). Hasta que se decida, las escrituras contra producción (alta de oportunidad, pausas, scoring, ajustes) fallarán por clave foránea.
- **Vuelta atrás:** `gcloud run services update-traffic rgb-api --to-revisions rgb-api-00003-5xn=100`.

### Puesta al día: migración 009 y RGB-16 (hecha el 2026-10-25)

- **Migración:** `009_project_plans` aplicada con el MCP de Supabase y registrada a mano en `schema_migrations` (`009_project_plans.sql`).
- **Backend:** `gcloud run deploy rgb-api --source backend --region us-central1` desde `main` (`8217d84`). Revisión `rgb-api-00005-9tj` con el 100 % del tráfico; la anterior, `rgb-api-00004-zp6`. Vuelta atrás: `gcloud run services update-traffic rgb-api --to-revisions rgb-api-00004-zp6=100`.
- **Estudio ficticio sembrado** en producción por decisión expresa de la persona responsable: fila `studies` con `00000000-0000-0000-0000-00000000e001` y nombre «Estudio de desarrollo», insertada con el MCP (equivale a `seed_dev --force`). Las escrituras ya no fallan por clave foránea. Sigue valiendo solo mientras la API use el contexto ficticio (RGB-2).
- **Comprobado (solo lectura):** `/api/health`, `/api/portfolio`, `/api/settings/scoring` en 200 y `/api/projects/PRY-0000-000/plan` en 404 con `project_not_found` (la ruta nueva existe).

### Puesta al día: RGB-17 y RGB-19 (hecha el 2026-10-25)

- **Sin migraciones:** RGB-17 (ficha del proyecto, lectura y edición) y RGB-19 (promoción a Briefing y ficha v1) no tocan el esquema; usan `exit_deliverables`, `frozen_versions` y `project_plans` ya existentes.
- **Backend:** `gcloud run deploy rgb-api --source backend --region us-central1` desde `main` (`17d9e0a`). Revisión `rgb-api-00006-r42` con el 100 % del tráfico; la anterior, `rgb-api-00005-9tj`. Vuelta atrás: `gcloud run services update-traffic rgb-api --to-revisions rgb-api-00005-9tj=100`.
- **Comprobado (solo lectura):** `/api/health`, `/api/portfolio` y `/api/settings/scoring` en 200; `/api/projects/PRY-0000-000/sheet` y `/plan` en 404 con `project_not_found` (las rutas existen). No se lanzó ningún `POST`/`PUT`.

La guía de abajo se conserva como referencia del procedimiento.

1. **Antes:** CI en verde en `main` y `curl https://rgb-api-368607571687.us-central1.run.app/api/health` responde `ok`.
2. **Migraciones (en este orden, una sola ejecución):** `006`, `007`, `008` solo crean tablas nuevas (con RLS; `opportunity_scorings` es de solo inserción), sin tocar datos existentes. Aplícalas con el Job (`gcloud run jobs deploy rgb-migrar …` y `execute --wait`, ver arriba) o a mano con `python -m backend.app.shared.migrate`. Salida esperada: `006_opportunities.sql, 007_pauses.sql, 008_scoring.sql`. El migrador corre cada archivo en su transacción: si una falla, las anteriores quedan aplicadas y se puede reintentar.
3. **Estudio ficticio:** las escrituras (alta de oportunidad, pausas, scoring, ajustes) fallan por clave foránea si no existe la fila de `studies` con `DEV_STUDY_ID`. La siembra no es una migración y se niega a correr contra un host no local, así que en producción es una decisión consciente: `DATABASE_URL=<pooler> python -m backend.app.shared.seed_dev --force` (idempotente). Hazlo solo mientras la API siga usando el contexto ficticio y la base solo tenga datos de demo (RGB-2 trae los estudios reales).
4. **Backend:** `gcloud run deploy rgb-api --source backend --region $REGION` (conserva secretos y variables del servicio actual).
5. **Comprobar (solo lectura):** `GET /api/health`, `GET /api/portfolio` (200 con `projects` vacío o con las filas sembradas), `GET /api/settings/scoring` (200 con los pesos por defecto) y `GET /api/projects/PRY-0000-000/pauses` (404 con `{detail:{code,message}}`, no el 404 genérico de ruta). No lances `POST`/`PUT` de prueba contra Cloud Run: la API es pública, sin autenticación, y cada escritura queda en la auditoría.
6. **Front:** no hace falta redesplegar (`NEXT_PUBLIC_API_URL` ya está fijada). Abre `/portfolio` y `/projects` en producción y comprueba que cargan.
7. **Vuelta atrás:** el backend se revierte con `gcloud run services update-traffic rgb-api --to-revisions <revisión-anterior>=100`; las migraciones solo añaden tablas, así que se pueden dejar aplicadas con el backend anterior.

## Activar el acceso con usuarios (RGB-2)

Hasta ahora la API corre con un estudio y un usuario ficticios (`AUTH_MODE=dev`, el valor por defecto). Esta sección pasa la API a `AUTH_MODE=supabase`: cada petición lleva el token de Supabase Auth y solo entran personas invitadas. Plan y reglas: [docs/plans/RGB-2/plan.md](plans/RGB-2/plan.md).

**Estado: nada de esto está activado ni verificado contra servicios reales.** El código y la migración 010 están probados en local con claves y tokens generados en los tests. Por verificar con servicios reales: el inicio de sesión con Google, el nivel `aal2` tras el segundo factor (TOTP) y los claims reales del token (`email`, `aal`, `user_metadata.email_verified`, firma ES256). Microsoft queda pendiente: no se configura en esta entrega.

### 1. Google (Google Cloud y Supabase)

1. En Google Cloud → APIs y servicios → Credenciales, crea un **ID de cliente OAuth** de tipo **Aplicación web**.
2. En «URI de redirección autorizados» añade exactamente `https://teiegxepgraxxsuisgtb.supabase.co/auth/v1/callback`.
3. En Supabase → Authentication → Providers → **Google**: actívalo y pega el **Client ID** y el **Client Secret** directamente en el panel. Nunca los pegues en un chat, en un issue ni en el repo.
4. En Supabase → Authentication → **URL Configuration**: **Site URL** = el dominio de Vercel; en «Redirect URLs» añade también `http://localhost:3000` (y su ruta de retorno cuando exista RGB-2b).
5. En Supabase → Authentication → **Multi-Factor** (MFA): activa **TOTP**. Socio, director y administración exigen `aal2`; sin el segundo factor la API responde 403 `mfa_required`.
6. Comprueba en el proyecto que las claves de firma de los tokens son asimétricas (ES256). La API solo acepta ES256; un proyecto con el secreto HS256 antiguo daría 401 a todos los tokens.

### 2. Variables en Cloud Run

| Variable | Valor | Notas |
| --- | --- | --- |
| `AUTH_MODE` | `dev` (por defecto) o `supabase` | Con `supabase` los endpoints de negocio exigen `Authorization: Bearer <token>`; `/api/health` sigue público. Un valor distinto no arranca. |
| `SUPABASE_URL` | `https://teiegxepgraxxsuisgtb.supabase.co` | Obligatoria con `AUTH_MODE=supabase`: sin ella la API no arranca. De ahí salen el emisor del token y las claves públicas (`/auth/v1/.well-known/jwks.json`). |
| `ENVIRONMENT` | `production` | Con `AUTH_MODE=dev` y `ENVIRONMENT=production` la API arranca, pero deja un aviso en el registro. |

```bash
gcloud run services update rgb-api --region $REGION \
  --update-env-vars AUTH_MODE=dev,ENVIRONMENT=production,SUPABASE_URL=https://teiegxepgraxxsuisgtb.supabase.co
```

### 2b. Variables del front en Vercel (RGB-2b)

| Variable | Valor | Notas |
| --- | --- | --- |
| `NEXT_PUBLIC_AUTH_MODE` | `dev` (por defecto) o `supabase` | Con `dev` el front no cambia: sin pantalla de acceso, sin cabecera nueva y sin variables de Supabase. Un valor distinto falla. |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://teiegxepgraxxsuisgtb.supabase.co` | Obligatoria con `supabase`; sin ella el front falla con un mensaje claro. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clave **publicable** del proyecto | Obligatoria con `supabase`. Nunca la `service_role`. Se fija en el panel de Vercel, no en el repo. |

Son `NEXT_PUBLIC_*`: Next las incrusta en el build, así que cambiar cualquiera exige **redesplegar** el front. La sesión va en cookies (`@supabase/ssr`); el `proxy` de Next refresca la sesión y redirige a `/login`, y las páginas que leen la API en el servidor envían el token leído de esas cookies. Rutas nuevas: `/login`, `/login/mfa` y `/auth/callback`. Añade `https://<dominio-de-vercel>/auth/callback` a «Redirect URLs» de Supabase (y `http://localhost:3000/auth/callback` para local).

### 3. Orden recomendado

1. **Migración 010** (`study_members` y la función `resolve_member`): pruébala antes en una rama de Supabase o, si no, con cuidado y en una ventana tranquila. Crea el rol `rgb_member_resolver` y cambia el propietario de la función; para eso concede `CREATE` sobre el esquema a ese rol solo durante la migración y lo revoca justo después, de modo que se aplica con el rol `postgres` (no superusuario). Aplícala con el Job de migraciones, como las anteriores.
2. **Desplegar el backend con `AUTH_MODE=dev`**: nada cambia para quien ya lo usa. Comprueba `/api/health` y una lectura.
3. **Primer socio (bootstrap).** El primero no puede invitarse a sí mismo. Desde una terminal propia, pidiendo `DATABASE_URL` por entrada interactiva (que no quede en el historial ni en un chat):

   ```bash
   read -rs -p "DATABASE_URL: " DATABASE_URL && export DATABASE_URL
   python -m backend.app.shared.bootstrap_member --study <id-del-estudio> --email <email> --role partner
   ```

   Es idempotente y solo deja una invitación pendiente (con su evento de auditoría); la persona la activa al entrar por primera vez con ese correo verificado. El estudio debe existir ya.
4. **Comprobar** con la API aún en `dev`: que la fila existe en `study_members` con estado `invited`.
5. **Pasar a `AUTH_MODE=supabase`:** `gcloud run services update rgb-api --region $REGION --update-env-vars AUTH_MODE=supabase`. Comprueba que sin token un endpoint de negocio responde 401 `unauthenticated` y que `/api/health` sigue en 200. Con RGB-2b el front ya envía el token, pero hazlo **después** de los pasos de front siguientes.

**Orden de activación completo (back y front):**

1. Desplegar el front con `NEXT_PUBLIC_AUTH_MODE=dev` (o sin la variable): nada cambia.
2. Configurar Google en Supabase (apartado 1) y crear al primer socio (paso 3).
3. En Vercel, fijar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_AUTH_MODE=supabase`, y redesplegar el front. Comprobar que `/login` se muestra y que el primer socio entra y da de alta el doble factor.
4. Con el front ya en `supabase`, pasar Cloud Run a `AUTH_MODE=supabase` (paso 5).

### 4. Vuelta atrás

Vuelve a `dev`: `gcloud run services update rgb-api --region $REGION --update-env-vars AUTH_MODE=dev`. Es inmediato y no pierde datos. En el front, vuelve a `NEXT_PUBLIC_AUTH_MODE=dev` en Vercel y redespliega (sin variables de Supabase vuelve el comportamiento anterior). Si solo vuelves el back a `dev`, el front en `supabase` sigue pidiendo acceso, pero funciona. La migración 010 solo añade una tabla y una función, así que se puede dejar aplicada con el backend anterior.

### 5. Qué no está verificado aún

- Google real de extremo a extremo (consentimiento, `email_verified` en el token).
- `aal2` real tras activar TOTP en Supabase.
- Los claims reales de un token de Supabase (nombres y tipos) frente a los generados en los tests.
- La migración 010 sobre Supabase con el rol `postgres`.
- Microsoft: pendiente; no hay proveedor configurado.

## Orden recomendado

1. Supabase y probar migraciones.
2. Cloud Run + Job de migraciones + comprobar `/api/health`.
3. Vercel con `NEXT_PUBLIC_API_URL` y ajustar `CORS_ORIGINS`.
