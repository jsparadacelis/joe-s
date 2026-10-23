# Despliegue

Front en Vercel, backend en Google Cloud Run (capa gratuita, región de EE. UU.) y base de datos en Supabase.

> **Aviso de datos.** El README fija la base de datos en la UE (Supabase). Con la API en EE. UU. cada consulta cruza el Atlántico (~100 ms) y los datos de proyectos pasan por EE. UU. Aceptable para una demo con datos ficticios; antes de usar datos reales hay que decidir si es compatible con el RGPD o mover la API a `europe-west1` (deja de ser gratuito, pero cuesta céntimos con este tráfico). Comprueba también en la página de precios de Cloud Run qué regiones entran en la capa gratuita.

## 1. Base de datos (Supabase)

1. Crea el proyecto (región UE).
2. Copia la cadena de **conexión directa** (puerto 5432) para migrar y la del **pooler en modo sesión** para la API. El modo transacción también sirve para la API, porque `SET LOCAL ROLE` y `set_config(..., true)` viven dentro de la transacción.
3. La migración `002_multiestudio.sql` crea el rol `rgb_app` y hace `GRANT rgb_app TO current_user`. Pruébala contra Supabase antes de desplegar.

## 2. Backend (Cloud Run)

Requisitos: proyecto de Google Cloud con facturación activada (la capa gratuita lo exige) y `gcloud` instalado.

```bash
PROYECTO=<id-del-proyecto>
REGION=us-central1   # también us-east1 o us-west1

gcloud config set project $PROYECTO
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com

# Secreto con la conexión a la base de datos
printf '%s' 'postgresql://...' | gcloud secrets create database-url --data-file=-

# Primer despliegue (construye con el Dockerfile de la raíz)
gcloud run deploy rgb-api \
  --source . \
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
  --source . --region $REGION \
  --command python --args=-m,backend.app.shared.migrate \
  --set-secrets DATABASE_URL=database-url:latest
gcloud run jobs execute rgb-migrar --region $REGION --wait
```

Usa en el secreto la conexión directa si el pooler da problemas con DDL.

### Notas

- Escala a cero: la primera petición tras un rato sin uso tarda 1–3 s. `--min-instances 1` lo evita, pero deja de ser gratis.
- Mientras no exista autenticación (RGB-2) la API usa un estudio y usuario ficticios (`DEV_ESTUDIO_ID`, `DEV_USUARIO_ID`). No publiques endpoints de negocio ni datos reales hasta tenerla.
- `railway.toml` quedó de la primera opción (Railway) y no se usa.

## 3. Front (Vercel)

1. Importa el repositorio; la raíz es el proyecto Next.js. No hace falta `vercel.json`.
2. Variable de entorno `NEXT_PUBLIC_API_URL` = URL de Cloud Run.
3. Añade el dominio de Vercel (y los de preview que uses) a `CORS_ORIGINS` en Cloud Run, separados por comas:
   `gcloud run services update rgb-api --region $REGION --update-env-vars ^@^CORS_ORIGINS=https://a.vercel.app,https://b.vercel.app`
4. `next/font/google` necesita red en el build; en Vercel la hay. Pasar a fuentes locales sigue pendiente (ver [estado](estado.md)).

Hoy el front solo usa datos de ejemplo y todavía no llama a la API.

## Orden recomendado

1. Supabase y probar migraciones.
2. Cloud Run + Job de migraciones + comprobar `/api/health`.
3. Vercel con `NEXT_PUBLIC_API_URL` y ajustar `CORS_ORIGINS`.
