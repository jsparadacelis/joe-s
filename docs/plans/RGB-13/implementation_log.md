# RGB-13 · Registro de implementación (integración)

Rama `feat/RGB-13-integration` = `feat/RGB-13` (plan y contrato) + `feat/RGB-13-back` + `feat/RGB-13-front` + las correcciones de la integración. El contrato ([contract.md](contract.md)) no se ha cambiado. Registros por frente: [backend-log.md](backend-log.md) y [front-log.md](front-log.md).

## Qué se hizo en cada frente

**Back.** Migración `006_opportunities.sql` (tabla 1:1 con `projects`, RLS), contexto `opportunity` (validación en dominio, caso de uso `CreateOpportunity`, código `PRY-AAAA-NNN` bajo `pg_advisory_xact_lock`, auditoría `create_opportunity`), contexto `portfolio` de solo lectura y las rutas `POST /api/opportunities`, `GET /api/portfolio`, `GET /api/projects/{code}`. 549 tests. Su log menciona un hallazgo del Tester (un `\u0000` daba 500) pero no dice si los roles fueron subagentes anidados: no puedo afirmarlo.

**Front.** `lib/opportunities.ts`, formulario `/opportunities/new`, botón en la cartera, `fetchPortfolio`/`fetchProject`/`listProjects` sobre la API, estados «Sin calcular»/«Sin fecha»/«Sin plan hasta promover». 1270 tests. Para ser honestos: el front **no usó subagentes anidados**; hizo los roles (escritor de tests, desarrollador, tester) en secuencia en una sola sesión (lo dice su log). Solo se probó contra un servidor falso.

## La integración

1. Fusión de `origin/feat/RGB-13-back` y `origin/feat/RGB-13-front` sobre `origin/feat/RGB-13`: **sin conflictos** (tocan carpetas y docs distintos).
2. **Alineación de mensajes** (el contrato dejaba abiertos los motivos de `invalid_field`). Mandan los del back, que son los que devuelve la API. Primero se cambiaron los tests (15 en rojo) y luego `frontend/lib/opportunities.ts`:
   - texto largo: «no puede superar los N caracteres» (el front decía «debe tener como máximo N caracteres»);
   - tipología: «no es una tipología admitida» (el front: «elige una de las tipologías disponibles»);
   - fecha inexistente (`2027-02-29`, `2026-13-01`, `0000-01-01`): «no es una fecha existente»; el formato malo sigue siendo «debe ser una fecha con formato aaaa-mm-dd» (el front daba el de formato para ambos);
   - presupuesto: el orden de comprobación es el del back (número → negativo → tope → decimales), así `1000000000.001` da «no puede superar…» y no «2 decimales»;
   - `\u0000` y sustitutos sueltos en los textos: «contiene caracteres no permitidos» (el cliente los dejaba pasar y el servidor daba 422);
   - longitud en caracteres (puntos de código), como Python, no en unidades UTF-16 (un emoji contaba 2).
   Límites iguales ya: 120/120/200/120/120, tope 1.000.000.000, 2 decimales, fechas `aaaa-mm-dd`, seis tipologías.
3. Verificación: `ruff check backend` limpio; `pytest backend` 549 en verde (Postgres `back-db-1`); front `lint`, `typecheck`, `test` (58 suites, 1278 tests) y `build` en verde.

## Prueba de punta a punta (API real)

Migraciones aplicadas (`Migraciones aplicadas: ninguna`: la 006 ya estaba), uvicorn en :8000 con CORS para `http://localhost:3000`, `next build` + `next start` con `NEXT_PUBLIC_API_URL=http://localhost:8000`, Playwright en claro y oscuro. Base limpiada antes (se borró la oportunidad `PRY-2026-001` que dejaron los frentes; `audit_events` no se tocó) y sembrados tres proyectos ficticios (`PRY-2025-015` `unknown`, `-016` verde, `-017` rojo) para los filtros.

Resultados (todo OK salvo lo anotado):
- Cartera con 3 filas reales: `unknown` muestra «Sin calcular», «Sin hito próximo», «Sin responsable»; resumen coherente («Proyectos activos 4», «En riesgo 1» tras el alta: `unknown` no cuenta como riesgo); opciones del filtro con «Sin plan» y «Sin calcular».
- `/opportunities/new` vacío → 5 errores de cliente con foco en «Nombre» → «1.234» en presupuesto: «admite como máximo 2 decimales».
- **422 real del servidor** junto al campo, con foco y datos conservados: nombre `U+001F` (el `trim` de JS no lo quita, el `strip` de Python sí) → «El campo «Nombre» es obligatorio.»; y un `\u0000` inyectado en el cuerpo de la petición → «El campo «Nombre» no es válido: contiene caracteres no permitidos.» (idéntico al texto del cliente).
- Alta válida → «Guardando…» → `/portfolio` con `PRY-2026-001` en fase «0. Oportunidad», «Sin plan hasta promover», «Sin plan», responsable correcto. Segunda alta (modo oscuro) → `PRY-2026-002` (consecutivo).
- Filtros con filas reales: «Sin calcular» deja 1 fila; «Sin plan» deja las oportunidades.
- Clic en la fila → ficha sin 404; «Plan y tiempos» de la nueva oportunidad carga («Sin plan hasta promover»); `PRY-2025-015/phase/1` 200; código inexistente 404.
- `/projects` lista reales y de ejemplo; `PRY-EJ-001/phase/3`, `PRY-EJ-002/phase/2` y `PRY-EJ-003/plan-and-timing` responden 200.
- Sin errores de consola salvo los esperados (los 422 provocados y el 404 del código inexistente); ningún error de CORS. El preflight `OPTIONS /api/opportunities` devuelve `access-control-allow-origin: http://localhost:3000`. Los `requestfailed` `net::ERR_ABORTED` son prefetch RSC de `next/link` cancelados al navegar, no fallos.
- **API caída** (uvicorn parado): el formulario conserva los datos y muestra «No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.»; `/portfolio` muestra el mismo aviso con «Reintentar»; `/projects` sigue sirviendo los ejemplo (200).
- axe sin violaciones en cartera, formulario (vacío, con errores, 422, API caída), ficha, en claro y oscuro.
- Cloud Run (solo lectura): `/api/health` 200; `/api/portfolio` 404, como se esperaba (aún no tiene este back).
- Auditoría: `audit_events` registra `create_opportunity` por cada alta.

Pantallazos en [screenshots/](screenshots/) (`integration-*`, claro y oscuro, datos ficticios). Se borraron los `front-*.png` (tomados contra el servidor falso). La base local queda sin proyectos (las filas de la prueba se borraron).

## Discrepancias halladas y cómo se resolvieron

| Discrepancia | Resolución |
| --- | --- |
| Motivos de `invalid_field` distintos entre cliente y servidor (ver arriba) | Cliente alineado con el back (tests primero) |
| `\u0000`/sustituto suelto pasaba el cliente y daba 422 | Cliente lo rechaza con el mismo texto |
| Longitud UTF-16 vs puntos de código | Cliente cuenta puntos de código |
| Orden tope/decimales del presupuesto | Cliente con el orden del back |
| `trim` de JS ≠ `strip` de Python (U+001C–U+001F, U+0085, U+FEFF) | **No resuelta**: sin impacto; el 422 del servidor se muestra bien. Seguimiento |

Ningún fallo del back ni del contrato. Ninguna discrepancia obligó a cambiar el contrato.

## Supuestos provisionales del plan

Los del plan: oportunidades en fase 0 sin plan (`phase_weeks` nulo → «Sin plan hasta promover»); responsable guardado como texto libre en `owner`; código `PRY-AAAA-NNN` con el año UTC del reloj; opcionales vacíos = nulos; presupuesto 0 a 1.000.000.000 con 2 decimales; entidad de auditoría `project`; el semáforo `unknown` para cualquier fase > 0 sin semáforo guardado.

## Seguimientos

- `/opportunities/new` sin entrada de menú.
- `force-dynamic` en `/projects` (lee la API en cada petición).
- Dato técnico, relieve, entregables y referencia catastral siguen de ejemplo; un proyecto real los muestra vacíos.
- Permisos por rol (RGB-4); desplegar este back en Cloud Run y aplicar la migración 006 en Supabase antes de apuntar Vercel a él.
- Estado `unknown` y semáforo/hito/semanas calculados en servidor (RGB-16, 17, 21).
- Alinear `trim`/`strip` (ver tabla).

## Estado

RGB-13 queda lista salvo las decisiones pendientes de producto (qué proyectos entran en la cartera y si se ocultan los cerrados, qué manda para el próximo hito, dueño de «bloqueo» y «última actualización»), recogidas en [huecos-backend](../../huecos-backend.md). Estado en Notion a «En revisión»; la persona revisora lo pasa a «Hecho».
