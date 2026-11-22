# RGB-54: log de implementación

## 2026-11-22

**Antes (us-central1):** servicio `rgb-api`, última revisión `rgb-api-00019-cmr`, URL `https://rgb-api-368607571687.us-central1.run.app`. Variables: `CORS_ORIGINS=https://joe-s.vercel.app,http://localhost:3000`, `AUTH_MODE=supabase`, `SUPABASE_URL`, `DB_POOL_MAX=4` y el secreto `DATABASE_URL=database-url:latest`. 1 vCPU, 512 MiB, concurrencia 80, tiempo máximo 300 s, máximo 2 instancias y arranque con CPU extra.

**Pasos hechos:**

1. **Configuración copiada** con `gcloud run services describe --format export`, sin valores de secretos.
2. **Desplegado en `europe-west1`** desde `main` (`44786ec`) con los mismos parámetros. Revisión `rgb-api-00001-7t7`, URL `https://rgb-api-368607571687.europe-west1.run.app`. `min-instances 0`, `max-instances 2`, sin `cpu-throttling=false` (facturación por petición).
3. **Limpieza de imágenes:** política en `cloud-run-source-deploy` (`europe-west1`): `keep-latest-3` y `delete-older`. Repositorio nuevo: 61 MB. El de `us-central1` (401 MB) se borra en el paso 8.
4. **Comprobado (sin sesión):**
   - `/api/health` en 200. Con conexión reutilizada desde España responde en 38 ms (antes 122 ms); con conexión nueva, en ~190 ms (antes ~300 ms).
   - Preflight CORS desde `https://joe-s.vercel.app` correcto.
   - No se lanzó ningún `POST`/`PUT`.
5. **Migraciones:** no existe ningún Job `rgb-migrar` en ninguna región; las migraciones se vienen aplicando con el MCP de Supabase. No hay migraciones pendientes.
6. **Vercel:**
   - `NEXT_PUBLIC_API_URL` (producción y preview) = URL de `europe-west1`. El valor antiguo queda anotado arriba para volver atrás.
   - Producción redesplegada (`dpl_Es2eEaE1Aro47YDu6qwGcpbBY6Uv`, `READY`, alias `joe-s.vercel.app`).
   - Comprobado que el JavaScript publicado contiene solo la URL de `europe-west1`.
9. **Presupuesto:** umbral del 20 % (1 $) añadido a «RGB Proyectos 5 USD» (quedan 20/50/100 %).
10. **Documentación:**
    - `docs/despliegue.md`: región; fuera el aviso de datos y la frase «deja de ser gratuito»; arranque en frío medido; nueva sección «Mantenerlo gratis».
    - `docs/arquitectura.md`: la región.

**Hallazgo: las funciones de Vercel corren en `iad1` (Virginia).** `app/projects/[code]/phase/[phase]/page.tsx`, `plan-and-timing` y `scoring` llaman a la API desde el servidor de Vercel. Esas llamadas pasan ahora de Virginia a Bélgica (~90 ms cada una). Antes iban de Virginia a Iowa (~30 ms), pero entonces cada petición de la API tardaba 1,3 s más por la base, así que el balance es claramente mejor. Lo ideal es poner las funciones en `cdg1` (París) o `fra1`. Es un ajuste del proyecto de Vercel que no estaba en el plan: queda para que lo decida la persona responsable.

11. **Ping de 12 h a `GET /`:** el agente es `VertexProxyCandidateCheck/1.0` (IP de Google, `199.7.140.60`), una comprobación automática de Google sobre las URLs de Cloud Run. No es nuestro, no toca la base y no hay nada que hacer.

**Pendiente:**

- **Paso 7:** entrar en producción con una sesión real (cartera, un proyecto, «Por promover», ajustes), comprobar que no hay errores de CORS y medir en los logs de `europe-west1` la latencia de servidor (criterio: mediana ≤ 400 ms en caliente).
- **Paso 8:** tras 24 h sin tráfico en `us-central1`, borrar el servicio y el repositorio de imágenes de allí.
