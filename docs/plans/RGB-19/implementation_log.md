# RGB-19 · Registro del Tester

Rama `feat/RGB-19-sheet-promotion` (primera ronda más abajo; la segunda ronda, al final). Verificación de punta a punta con el build real de Next (`next build` + `next start` en el 3010, `NEXT_PUBLIC_API_URL=http://localhost:8000`) contra uvicorn real y el Postgres local `back-db-1` (54329). Solo local: nada de Supabase, Cloud Run ni Vercel. Datos ficticios (`PRY-2026-955…990`). El Tester no tocó código de producción ni de tests. Veredicto del Juez: pendiente.

## Qué se hizo

- Entorno: uvicorn con `DEV_ROLE=partner` (8001), `architect` (8002), `director` (8003) y, aparte, `architect` con `DEV_QUALIFICATIONS=licensed_signatory,sponsor,site_management` (8004, solo API). Un proxy local en el 8000 reenvía al 8001 y, a petición, cambia de uvicorn (rol sin autoridad), responde 500 (con y sin `detail`), corta la conexión, devuelve HTML o una forma errónea en `POST /sheet/promote`, añade latencia a la promoción o hace fallar `GET /sheet`. No se interceptó el navegador. Playwright (Chromium, `es-ES`), claro y oscuro, axe-core (todas las reglas).
- Cifras del Desarrollador (no reejecutadas por el Tester): back **1485**, front **1811**, en verde. `next build` en verde.

## Criterios

| Criterio | Resultado |
|---|---|
| El botón se activa solo con todos los obligatorios rellenos y para socio o director | **Cumple.** Ficha al 35 %: «Promover a 2 · Briefing y concepto» deshabilitado, razón visible «Faltan 13 campos obligatorios» (enlazada con `aria-describedby`) y faltantes por bloque. Al rellenar los 7 bloques desde la pantalla pasa 40, 55, 70, 75, 85, 95 y 100 %, sigue deshabilitado hasta el 100 % y se activa sin recargar. `architect` (con o sin cualificaciones) con ficha al 100 %: deshabilitado con «Solo un socio o un director puede promover», sin «Editar»; `director` y `partner`: `can_promote: true`. Por API: 403 `no_authority` auditado y fase intacta. |
| La ficha v1 se ve en solo lectura al navegar a la fase 1 desde fases posteriores | **Cumple.** Desde la fase 2 y la 3: «Ficha v1 congelada · solo lectura», sin Editar, sin Promover ni panel, solo GET. Cambiar después nombre, cliente, ubicación, tipología, semáforo y plantillas de plan en BD no altera la respuesta (JSON idéntico). `PUT /sheet` y `POST /sheet/promote` en fase 2 o 3: 409 `sheet_not_editable`. |

## Pruebas adicionales

- **Promoción de punta a punta (claro y oscuro):** confirmación con foco en «Confirmar promoción»; Escape y Cancelar cierran sin enviar nada y devuelven el foco al botón; Tab va de Confirmar a Cancelar; Espacio abre y Enter confirma. Éxito: aviso `role=status` con foco, enlace a `/phase/2`. BD: `projects.current_phase=2`; `frozen_versions` fase 1 versión 1 con `sheet`; `exit_deliverables` fase 1 completo y aprobado y fase 2 abierto (no completo, no aprobado); `promotions` `promote 1->2 ok`; auditoría `project/promote/ok` y `project_sheet/freeze/ok` versión 1.
- **Doble clic** en confirmar con 1,5 s de latencia: un único POST, «Promoviendo…», Cancelar y promover deshabilitados, Escape ignorado mientras se envía.
- **API:** ficha incompleta 422 `incomplete_deliverable` con `missing` en español (13 etiquetas), auditado; 404 `project_not_found`; proyecto en fase 0 409; ninguna acción cambia la fase salvo promover.
- **Errores en pantalla** (aviso `role=alert` con foco, botón de confirmar reactivado y reintento con éxito): 403, 422 (campo vaciado por otro actor), 409 (promovido en otra pestaña), 500 con `detail`, 500 sin cuerpo, conexión cortada, HTML y forma inválida. Con `GET /sheet` en 500 no aparece el botón. Fase sin cambios tras cada fallo.
- **axe:** 0 violaciones, claro y oscuro, en panel deshabilitado, habilitado, confirmación, éxito, errores 403/409/422/500, sin autoridad, ficha congelada desde fase 2 y desde fase 3.
- **Anchos 1024, 1280, 1440 y 1920 px**, claro y oscuro: sin desbordamiento horizontal de la página ni del panel.
- **Peticiones:** solo las esperadas (GET de la página, 7 PUT de la ficha, 1 POST de promoción); sin errores de consola salvo los registros del navegador de las 4xx/5xx provocadas.

## Hallazgos

Severidad: Bloqueante, Alta, Media, Baja, Info. **No hay bloqueantes ni altos.**

1. **Media. Carrera de promociones: la perdedora recibe 403 en vez de 409 y no queda auditada.** Repro API: crear proyecto con ficha completa y lanzar 10 `POST /api/projects/{code}/sheet/promote` en paralelo: 1 devuelve 200, 7 devuelven 409 y **2 devuelven 403** `no_authority` («en la fase 2… Director de proyecto») pese a ser `partner`. Repro UI: dos pestañas con la confirmación abierta, confirmar a la vez (con 0,8 s de latencia): la ganadora ve el éxito y la otra ve «No tienes autoridad para esta acción en la fase 2. Pueden hacerlo: Director de proyecto.», engañoso. Causa probable: el caso de uso lee la fase 1 sin bloqueo, la ganadora confirma, y `PromotionService.promote` de la perdedora ve la fase 2 y devuelve `NoAuthority`; se lanza `PromotionRejected`, se revierte la transacción y el rechazo no llega a la auditoría. Integridad correcta: una sola versión 1, una sola promoción, sin duplicados. Corrección sugerida: bloquear la fila del proyecto (`SELECT … FOR UPDATE`) al leer, o releer la fase tras finalizar y devolver `sheet_not_editable` (409) auditado.
2. **Baja. Tras promover, la página queda desactualizada hasta recargar:** la cabecera sigue en «Fase 1: Inicio», el paso 1 «actual», el entregable conserva «Guardar» y cada bloque muestra «Cambios guardados» (ver `promote-success-*`). La ficha y el aviso sí cambian.
3. **Baja. Texto duplicado en el 422:** «El entregable de salida no está listo. Falta: Riesgo principal. Riesgo principal» (el mensaje ya lista los faltantes y el componente los repite).
4. **Baja. Tras un 409 (promovido en otra pestaña) la pantalla sigue ofreciendo promover** con la ficha obsoleta; el mensaje reutiliza «La ficha solo se puede editar mientras el proyecto está en la fase 1», sin decir que ya se promovió. No hay botón de recarga.
5. **Baja. Información duplicada:** el resumen de la ficha y el panel de promoción muestran ambos «Faltan por rellenar» (uno plano y otro por bloque) y el porcentaje dos veces.
6. **Info.** Con `DEV_QUALIFICATIONS` el rol `architect` sigue sin autoridad en la fase 1 (correcto: solo rol). Un 409 en la fase 3 por `POST /sheet/promote` es coherente con el contrato.

## Pantallazos (`docs/plans/RGB-19/screenshots/`, claro y oscuro, datos ficticios)

`promote-disabled-*` (panel con razón y faltantes), `promote-enabled-*`, `promote-confirm-*`, `promote-success-*`, `promote-error-403-*`, `promote-error-409-*`, `promote-error-422-*`, `promote-error-500-*`, `promote-noauthority-*`, `frozen-sheet-*` (fase 1 desde fase 2) y `frozen-from-phase3-*`.

## Seguimientos

- Corregir el hallazgo 1 (bloqueo o releer fase) y añadir un test de concurrencia con Postgres real.
- Refrescar cabecera y entregable tras promover (hallazgo 2) y ofrecer recarga tras 409 (4).
- Quitar la duplicación del 422 y del resumen (3, 5).

## No verificado

Roles reales (RGB-2/4), despliegue en Cloud Run/Supabase, lector de pantalla real (solo árbol de roles y axe).

## Limpieza

Procesos propios parados (uvicorn 8001-8004, proxy 8000, next 3010); el `next-server` del 3000 es ajeno y no se tocó. `plan_templates` restaurada tras la prueba del snapshot.

## Segunda ronda

Cambios del Desarrollador: back **1491** tests (`FOR UPDATE` sobre la fila del proyecto al promover y al editar; la perdedora de la carrera recibe 409 `sheet_not_editable` auditado; el 422 dice «La ficha no está completa: falta 1 campo obligatorio / faltan N campos obligatorios.» con las etiquetas solo en `missing`) y front **1814** tests (`router.refresh()` tras promover conservando el aviso y su foco; en 409 el aviso «El proyecto ya no está en Inicio: otra persona pudo haberlo promovido. Recarga la página.» con «Recargar» y sin ofrecer «Promover»). Cifras del Desarrollador, no reejecutadas. Se reconstruyó el front, se reiniciaron uvicorn (8001 `partner`, 8002 `architect`, 8003 `director`) y el proxy de fallos, y se repitieron todos los scripts de la primera ronda sin interceptar el navegador. Todos los pantallazos se regeneraron.

### Resueltos y reverificados

1. **Carrera (antes Media): resuelto.** 5 rondas de 10 `POST /sheet/promote` en paralelo: en cada una exactamente un 200 y nueve 409 `sheet_not_editable`, ningún 403, una sola versión 1 congelada, fase 2 y los 9 rechazos auditados. Mezcla de 1 promoción y 5 `PUT` simultáneos: todo 200 sin errores ni duplicados. En la interfaz, con dos pestañas confirmando a la vez (0,8 s de latencia, claro y oscuro): una ve el éxito y la otra el aviso de 409 con «Recargar», sin mensaje de autoridad; `promote-race-loser-*`.
2. **Página desactualizada (antes Baja): resuelto.** Sin recargar, el paso 2 pasa a «actual» y el 1 a «hecha», desaparece «Guardar» del entregable, el aviso de éxito conserva el foco y el enlace «Ir a Briefing y concepto». El subtítulo «Fase 1: Inicio» es la fase que se está viendo, no la actual (igual que al navegar a la fase 1 desde otra fase), no es un defecto. axe en éxito tras el refresco: 0 violaciones.
3. **Texto del 422 (antes Baja): resuelto.** Pantalla: «La ficha no está completa: falta 1 campo obligatorio. Riesgo principal» (etiqueta una sola vez); API con 13 faltantes: «faltan 13 campos obligatorios.» y la lista en `missing`. Sigue auditado y el reintento tras corregir funciona.
4. **409 en la UI (antes Baja): resuelto.** Texto nuevo con foco en el aviso, único botón «Recargar» (ya no se ofrece «Promover»); «Recargar» muestra la ficha v1 congelada. Una sola versión 1.

### Regresiones

Ninguna. axe 0 violaciones, claro y oscuro, en panel deshabilitado y habilitado, confirmación, éxito, 403, 409, 422, 500, sin autoridad, perdedora y ganadora de la carrera, y ficha congelada desde las fases 2 y 3. Flujo 35 % -> 100 % -> promover (7 PUT + 1 POST), doble clic (un POST), Escape, Cancelar y teclado como antes. Ficha v1 sin botones desde la fase 2 y la 3; `PUT` y `POST` en fase 3 dan 409; sin desbordamiento entre 1024 y 1920 px. Cambiar datos del proyecto o plantillas no altera la ficha congelada (prueba de la primera ronda, sin cambios de código en esa zona).

### Pendientes (seguimientos)

- **Baja (5):** el resumen de la ficha y el panel de promoción repiten «Faltan por rellenar» y el porcentaje.
- No verificado: roles reales (RGB-2/4), despliegue en Cloud Run/Supabase y lector de pantalla real.

Pantallazos nuevos: `promote-race-loser-light.png` y `promote-race-loser-dark.png`; regenerados `promote-409`, `promote-422`, `promote-success` y `frozen-*`. Procesos propios parados al terminar; el `next-server` del 3000 no se tocó.

## Veredicto del Juez

**APROBADO.** Cifras propias (no las del Desarrollador ni las del Tester): `ruff check backend` limpio; `pytest backend -q` con `.venv-back` y `DATABASE_URL=postgresql://rgb:rgb@localhost:54329/rgb`: **1491 pasan, 0 saltados, 0 fallos** (185 s); `npm --prefix frontend run lint`: 0 errores, 1 aviso (`API_SHEET` sin usar en `PromotePanel.test.tsx`); `typecheck` limpio; `npm --prefix frontend test`: **81 suites, 1814 tests en verde**.

### Criterios
- **Botón solo con todos los obligatorios y para socio o director:** cumple. `can_promote` lo calcula el servidor (`sheet_permissions`: fase 1 + autoridad + 100 %) y el front solo lo pinta; el servidor vuelve a comprobar fase, autoridad y completitud al promover (orden: proyecto, fase 1, autoridad, completitud). Pantallazo `promote-disabled-*`: deshabilitado, razón visible «Faltan 13 campos obligatorios» enlazada con `aria-describedby`.
- **Ficha v1 en solo lectura desde fases posteriores:** cumple. Con fase > 1, `GET /sheet` devuelve el contenido de `frozen_versions` (`get_frozen`, sin `build_sheet`), `frozen_version: 1` y permisos `false`; `PUT` da 409. Pantallazos `frozen-sheet-*` y `frozen-from-phase3-*`: aviso «Ficha v1 congelada · solo lectura», sin Editar ni Promover.

### Reglas de CLAUDE.md
- **DDD:** `project_sheet.py` y `errors.py` siguen siendo dominio puro (solo importan dominio de `lifecycle`); la promoción pasa por `PromotionService` y un test de arquitectura impide que el caso de uso toque el repositorio o la infraestructura de `lifecycle`.
- **TDD:** hay tests por capa: dominio (`test_sheet_promotion.py`), caso de uso con `create_autospec`, rutas, Postgres real (`test_sheet_promote_routes_postgres.py`, `test_postgres_project_sheets_freeze.py`, incluida una prueba concurrente con hilos y barrera) y front. Tests existentes tocados: todos llevan docstring que justifica el cambio (el contrato se amplía con `permissions`/`frozen_version`, `read(context, code)`, la prop `editable` se sustituye por `permissions.can_edit`, `get_project(code, lock=True)`) y ninguno se debilita: se añaden claves y aserciones, no se quitan. Los `jest.mock("next/navigation")` son necesarios por el nuevo `useRouter`.
- **Idioma:** código en inglés; textos de interfaz y mensajes de error en español; datos ficticios (`PRY-2026-9xx`, «Promotora Ficticia S. L.», `contacto@ejemplo.test`).
- **IA y estado:** ninguna acción de IA cambia la fase; solo `POST /sheet/promote` por una persona con autoridad, vía `PromotionService`.
- **Auditoría:** el éxito audita `promote` (servicio) y `project_sheet/freeze` con versión 1; los rechazos de negocio (fase, autoridad, incompleta) quedan auditados en `_reject`; la perdedora de la carrera sale como 409 auditado.
- **Una transacción y concurrencia:** `finalize_content`, `promote` y `freeze` van en un único `study_transaction`; `PromotionRejected` se lanza para revertir todo. `SELECT … FOR UPDATE OF p` en promover y en editar serializa las carreras (el Tester la reverificó con 5 rondas de 10 peticiones: un 200 y nueve 409).
- **Inmutabilidad:** `frozen_versions` conserva las barreras de la migración 004 (sin UPDATE/DELETE para `rgb_app` + trigger); la ficha congelada se lee de ahí y nunca se recalcula. **Sin migración nueva** (ninguna en el diff).
- **RLS:** las consultas nuevas van por la conexión del estudio; no hay acceso fuera de él.

### Pantallazos
Existen 24 en `docs/plans/RGB-19/screenshots/`, en claro y oscuro, y el log los cita por prefijo. Abrí `promote-disabled-light`, `promote-error-409-light`, `promote-race-loser-dark`, `promote-success-light` y `frozen-sheet-dark`: corresponden al cambio actual (texto del 409 y «Recargar» de la segunda ronda; ficha 100 % congelada con fase 2 «actual»). Observaciones menores: en `promote-success-light` la cabecera se solapa con la barra lateral (artefacto de captura de página completa) y cada bloque muestra «Cambios guardados» residual; en los 409 y la perdedora de la carrera siguen visibles «Guardar» y «Editar» (la página queda obsoleta hasta recargar, el servidor los rechaza igualmente).

### Revisión de código y accesibilidad
Panel con `role="status"`/`role="alert"`, foco gestionado, Escape ignorado mientras se envía, protección contra doble envío (`submitting` ref), razón del botón deshabilitado enlazada. axe a 0 en las pruebas de jest y, según el Tester, en el navegador. Sin hallazgos bloqueantes.

### Atención antes del PR
- **`.mcp.json` está sin seguimiento y no está ignorado: no debe entrar en el commit** (añadir solo los archivos de RGB-19 por ruta).

### Seguimientos (ninguno bloqueante)
1. Hallazgo 5 del Tester (baja): el resumen de la ficha y el panel repiten «Faltan por rellenar» y el porcentaje.
2. Ocultar «Guardar»/«Editar» y limpiar «Cambios guardados» cuando la página queda obsoleta tras 409 o tras promover.
3. Quitar `API_SHEET` sin usar en `PromotePanel.test.tsx` (aviso de lint).
4. No verificado: roles reales (RGB-2/4), despliegue en Cloud Run/Supabase, lector de pantalla real.
5. Seguimientos heredados de 17a/17b (sin cambios por esta tarea): campos semanales sobre la ficha (RGB-45+) y control de concurrencia del editor más allá del bloqueo de fila.
