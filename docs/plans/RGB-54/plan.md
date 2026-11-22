# RGB-54: mover la API a Europa sin salir de la capa gratuita

Tarea en Notion: «Mover la API a Europa (Cloud Run europe-west1) sin salir de la capa gratuita» (Backlog, E0 · Fundaciones, Infra).

## Diagnóstico (2026-11-22)

| Pieza | Dónde |
|---|---|
| Personas usuarias | España |
| API | Cloud Run `rgb-api`, `us-central1` (Iowa), revisión `rgb-api-00019-cmr` |
| Base de datos | Supabase, pooler `aws-0-eu-west-1` (Irlanda) |

Medido en los logs de Cloud Run (`httpRequest.latency`, solo tiempo de servidor) y con `curl` desde España:

| Qué | Tiempo |
|---|---|
| `/api/health` (no toca la base) | 3 ms |
| `GET /api/projects/{code}`, `/sheet`, `/brief`, `/to-promote`, `/me` (en caliente) | 1,3–1,8 s |
| `PUT /sheet` · `POST /sheet/promote` | 1,7 s · 2,9 s |
| Arranque en frío | 6–7 s (hasta 10 s) |
| Red España → Iowa | ~120 ms por petición; ~300 ms si abre conexión |

Causa: cada petición hace unas 13 idas y vueltas a la base y cada una cruza el Atlántico (~100 ms). Hay dos transacciones: la de autenticación (`identity_transaction` + resolver a la persona) y la del endpoint (`study_transaction`). Cada una hace comprobación del pool, `BEGIN`, `SET LOCAL ROLE`, `set_config`, las consultas y `COMMIT`. Ya hay pool de conexiones (`backend/app/shared/db.py`), así que no se paga el TLS a la base en cada petición.

Esperado con la API en Europa (~15–20 ms por ida y vuelta con Irlanda): 0,2–0,35 s por petición.

## Decisión

**Cloud Run `europe-west1` (Bélgica).** La misma imagen, secretos y comandos; solo cambia la región.

- Frente a `europe-southwest1` (Madrid): Madrid está más cerca de las personas usuarias (una ida y vuelta por petición), pero más lejos de Irlanda (unas 13 por petición). Gana Bélgica. Las dos son Tier 1.
- Frente a Railway (Ámsterdam): latencia parecida y sin arranques en frío, pero obliga a migrar de plataforma. Se aparca; se decide en una tarea aparte junto con los arranques en frío.

## Capa gratuita: por qué sigue siendo gratis y cómo se vigila

- La capa gratuita de Cloud Run es por cuenta de facturación y cubre las regiones europeas de Tier 1 (`europe-west1` incluida). La nota de `docs/despliegue.md` que dice «deja de ser gratuito» está mal y se corrige.
- Consumo de los últimos 30 días: 561 peticiones y ~1.150 s de instancia, menos del 1 % de la capa gratuita (~180.000 vCPU-s y 2 millones de peticiones al mes).
- Salvaguardas:
  1. `--min-instances 0`, `--max-instances 2` y facturación por petición (sin `--no-cpu-throttling`).
  2. **Artifact Registry**: hoy `cloud-run-source-deploy` (us-central1) ocupa 401 MB sin política de limpieza, y la capa gratuita es de 0,5 GB. Se añade una política que guarda las 3 últimas imágenes en el repositorio nuevo de `europe-west1` y se borra el de `us-central1` al terminar.
  3. Presupuesto: ya existe uno de 5 $ al mes (avisos al 50/90/100/150 %). Se añade un aviso a 1 $ (20 %).
  4. Revisión mensual del informe de facturación por servicio, apuntada en `docs/despliegue.md`.
- Cloud Build (`--source`), Secret Manager y tráfico de salida quedan dentro de sus capas gratuitas con este volumen. Se comprueba en el informe de facturación una semana después.

## Pasos

Todo es infraestructura: no se toca código de la aplicación, así que no aplica TDD. Variables: `PROYECTO=rgb-proyectos-261024-11614`, `OLD=us-central1`, `NEW=europe-west1`.

1. **Copiar la configuración actual** (solo nombres y valores no secretos):
   `gcloud run services describe rgb-api --region $OLD --format export > <scratchpad>/rgb-api-us.yaml`. Anotar `CORS_ORIGINS`, `AUTH_MODE`, `SUPABASE_URL`, `DB_POOL_MAX` y los secretos (`DATABASE_URL=database-url:latest`). Los secretos de Secret Manager son globales: no hay que copiarlos.
2. **Desplegar en Europa** desde `main`:
   ```bash
   gcloud run deploy rgb-api --source backend --region $NEW \
     --allow-unauthenticated --min-instances 0 --max-instances 2 \
     --memory 512Mi --cpu 1 --cpu-boost \
     --set-secrets DATABASE_URL=database-url:latest \
     --set-env-vars ^@^CORS_ORIGINS=<igual>@AUTH_MODE=<igual>@SUPABASE_URL=<igual>@DB_POOL_MAX=<igual>
   ```
   La cuenta de servicio es la misma (`…-compute@developer`), que ya tiene acceso al secreto.
3. **Limpieza de imágenes** en el repositorio nuevo (`cloud-run-source-deploy`, `europe-west1`): política `keep` con las 3 versiones más recientes y `delete` para el resto (`gcloud artifacts repositories set-cleanup-policies … --no-dry-run`).
4. **Comprobar la API nueva (solo lectura):**
   - `GET /api/health` responde `ok`.
   - Con un token de una sesión real del front: `GET /api/me`, `/api/portfolio`, `/api/to-promote` y `/api/projects/{code}`.
   - Latencia de servidor en los logs de la revisión nueva: mediana ≤ 400 ms en caliente.
   - Nada de `POST`/`PUT` de prueba: la auditoría es inalterable.
5. **Migraciones:** el Job `rgb-migrar` (si se usa) se crea en `europe-west1` con los mismos argumentos. No hay migraciones pendientes, así que no se ejecuta ahora.
6. **Cambiar el front:** en Vercel, `NEXT_PUBLIC_API_URL` = URL nueva (`https://rgb-api-…-ew.a.run.app`) en producción y preview. Redesplegar producción, porque la variable se incrusta en el build.
7. **Comprobar el front de producción:** entrar, abrir cartera, un proyecto, «Por promover» y ajustes. Sin errores de CORS en la consola. Comprobar en los logs que el tráfico llega a `europe-west1` y no a `us-central1`.
8. **Retirar EE. UU.** tras 24 h sin tráfico en `us-central1`:
   - Borrar el servicio (`gcloud run services delete rgb-api --region $OLD`).
   - Borrar el repositorio `cloud-run-source-deploy` de `us-central1` (y el Job, si existe allí).
   - Antes, apuntar en el log la URL antigua y la última revisión.
9. **Presupuesto:** añadir el umbral de 0,2 (1 $) al presupuesto existente.
10. **Documentación:**
    - `docs/despliegue.md`: región `europe-west1`; quitar el aviso de datos y la frase «deja de ser gratuito»; sección «Mantenerlo gratis» (las salvaguardas de arriba y la revisión mensual); nueva URL; vuelta atrás.
    - `docs/arquitectura.md`: la región.
    - `docs/estado.md`, este plan, `implementation_log.md` y Notion al cerrar.
11. **Ping de 12 h a `/`:** alguien llama a `GET /` cada 12 h (404, sin tocar la base). Averiguar de dónde viene (¿un cron de Supabase o de GitHub?). Si su fin era que Supabase no se pausara, no lo consigue y además provoca un arranque en frío. Se anota y se decide aparte; no bloquea esta tarea.

## Vuelta atrás

Hasta el paso 8, el servicio de `us-central1` sigue intacto: basta con volver a poner su URL en `NEXT_PUBLIC_API_URL` y redesplegar el front. Después del paso 8, se redespliega con `gcloud run deploy rgb-api --source backend --region us-central1` y los mismos parámetros.

## Archivos que se tocan

- `docs/despliegue.md`, `docs/arquitectura.md`, `docs/estado.md`
- `docs/plans/RGB-54/plan.md`, `docs/plans/RGB-54/implementation_log.md`

Ningún archivo de código. Al ser solo `.md`, el PR se mergea sin pedir permiso.

## Criterios de aceptación

- La API responde en `europe-west1` con los mismos secretos y variables; el front de producción la usa y el CORS es correcto.
- Mediana de latencia de servidor en caliente ≤ 400 ms en los endpoints con base del diagnóstico.
- `min-instances 0`, `max-instances 2`, sin CPU siempre asignada.
- Política de limpieza (≤ 3 imágenes) en Artifact Registry `europe-west1`; servicio y repositorio de `us-central1` eliminados; almacenamiento < 0,5 GB.
- Presupuesto con aviso a 1 $.
- Documentación actualizada.

## Después (tareas aparte)

- **Menos idas y vueltas por petición** (backend, TDD): juntar `SET LOCAL ROLE` y `set_config`, quitar la comprobación del pool en cada uso y resolver a la persona dentro de la transacción del endpoint. De ~13 a ~5–6.
- **Arranques en frío** (6–7 s): `--min-instances 1` (~9–10 $/mes, sale de la capa gratuita) frente a Railway Hobby (~5 $/mes, siempre encendido). Decisión de la persona responsable.
