# RGB-48 · Tester

Rama `rgb-48/study-team-screen` (con `main` fusionado). Veredicto del Tester: **APROBADO**, sin bloqueantes ni altos. Pantallazos en [`screenshots/`](screenshots/) (claro y oscuro, 1280 px página completa salvo `team-320px`; el menú lateral sticky aparece partido por la captura, artefacto conocido). Datos ficticios `@example.com`. No se tocó código de producción ni tests.

## Resultados de las comprobaciones

| Comprobación | Resultado |
|---|---|
| `npm run lint` | 0 errores, 3 avisos preexistentes (`PromotePanel.test.tsx` `API_SHEET`, `auth.test.ts` `_omit` x2), ajenos a RGB-48 |
| `npm run typecheck` | verde |
| `npx jest` (suite completa) | 94 suites, **2096 tests** en verde |
| `npm run build` | verde |

## Entorno

`next build` + `next start` (3010) contra uvicorn real (`AUTH_MODE=dev`; `DEV_ROLE=partner` en el 8001 y `director` en el 8002) y Postgres local `back-db-1` (54329) en una **base propia `rgb48`** (migraciones 001-011 aplicadas; borrada al terminar), nunca producción. Un proxy local en el 8000 cambia de uvicorn (rol sin autoridad), añade latencia a los POST o hace fallar `GET /api/members` (500); el navegador no se interceptó. Playwright (Chrome, `es-ES`), claro y oscuro, axe-core con todas las reglas. 96 comprobaciones automatizadas: todas en verde salvo la de 320 px (hallazgo 1, no atribuible a RGB-48).

## Verificación de la pantalla `/settings`

- **Lista vacía:** «Todavía no hay personas en el equipo.» y formulario visible (`team-empty-*`).
- **Lista con los tres estados** (Invitada, Activa, Acceso retirado), cualificaciones con etiqueta o «—», sin botón en la persona retirada (`team-list-*`).
- **Formulario con errores** (cliente): correo vacío o `sin-arroba` pone el error junto al campo y el foco en él; sin rol, «Elige un rol.» y foco en el select (`invite-form-errors-*`).
- **Invitar con éxito:** correo `  Nueva.Persona@Example.COM  ` se guarda `nueva.persona@example.com`; aviso `role=status` «Invitación creada. La persona se activa…», formulario vaciado, foco en el correo, fila nueva «Invitada» (`invite-form-filled-*`, `invite-success-*`). El aviso desaparece al editar.
- **422** (servidor): un correo con U+0085 pasa la validación del cliente y el servidor responde «El correo no es válido.» junto al campo (`invite-error-422-*`).
- **409 repetido** (otra capitalización): «Ya existe un miembro con ese correo en el estudio.» junto al campo, con `aria-invalid` y `aria-describedby`, foco en el campo (`invite-error-409-*`).
- **403** (director invita a un socio): aviso `role=alert` con el mensaje del back «Solo un socio puede invitar o revocar a un socio, un director o a administración.», foco en el aviso, nada guardado en BD; después el director invita a un arquitecto con éxito y el error se borra (`invite-error-403-*`).
- **Retirar acceso:** la confirmación mueve el foco a «Confirmar retiro de …»; Escape y Cancelar cierran sin enviar nada y devuelven el foco a «Retirar acceso de …» (`revoke-confirm-*`). Éxito: «Acceso retirado a carla…», BD `revoked`, foco en la tabla (`revoke-success-*`). Último socio activo: 409 «No se puede revocar al último socio activo del estudio. Invita antes a otro socio.», sigue activo (`revoke-error-last-partner-*`). Director retirando a un socio: 403 con foco en el aviso (`revoke-error-403-*`).
- **Error de carga** (500 en el listado): aviso y «Reintentar», sin formulario; al reintentar se recupera (`load-error-*`).

## Intentar romper

- **Doble envío** con 1,5 s de latencia (clic, clic forzado y Enter): un único POST y una única fila; igual con doble confirmación de retiro (un POST).
- **Espacios y mayúsculas:** se recortan y pasan a minúsculas (arriba). Enter en el campo de correo envía.
- **XSS** (`<img/src=x/onerror=…>@example.com` y `a"><script>…</script>@example.com` sembrados en BD): se muestran como texto, no se ejecuta nada ni se inyectan nodos (`team-xss-*`).
- **Lector de pantalla** (árbol de accesibilidad de Playwright, no un lector real): tabla «Equipo del estudio» con `caption` y 5 `columnheader`; botones «Retirar acceso de a@example.com» y «Confirmar retiro de …»; formulario con nombre «Invitar a una persona»; `combobox` «Rol», grupo «Cualificaciones», región `status` para los avisos; errores de campo con `role=alert`.
- **Teclado:** correo, Tab, rol por flechas, casillas con Espacio, Tab hasta «Invitar» y Enter: invita y el foco queda en el correo.
- **Contraste y axe:** 0 violaciones (incluida `color-contrast`) en claro y oscuro en vacío, errores de formulario, lista, confirmación abierta, éxito de retiro, 409 de último socio, éxito de invitación, 409, 403, error de carga y 320 px.

## Hallazgos (ninguno bloqueante)

1. **Info/Media, no atribuible a RGB-48. A 320 px la página entera se desborda (scrollWidth 503) y el panel de Equipo queda aplastado (~38 px de ancho).** Repro: abrir `/settings` con viewport de 320 px (`team-320px-*`). Es del shell (la barra lateral no se colapsa, migas de pan) y se ve igual en `/portfolio` (454) y en los editores de plan y scoring; ya era el hallazgo 8 de RGB-16. La tabla sí tiene su propio scroll horizontal (`overflow-x-auto`).
2. **Baja. El formulario no tiene título visible «Invitar a una persona»** (solo `aria-label`); se distingue por un hueco bajo la tabla. Sugerencia: un `h3`/legend visible.
3. **Baja. Tras retirar con éxito el foco va al contenedor de la tabla (`div tabindex=-1` sin nombre accesible)**; el lector solo anuncia el aviso `status`. Sugerencia: `aria-label` en el contenedor o enfocar el aviso.
4. **Info.** El cliente es más estricto que el servidor: `a@b..c` y `a@.com` se rechazan en pantalla pero la API los acepta (201). El plan lo prevé («el back manda»); si se quiere endurecer es cosa del back.
5. **Info.** Un 403 al listar no se probó con el rol `architect` (el back lo da con `detail`); el 403 de las acciones sí.

## No verificado

Lector de pantalla real, Supabase y Google reales (solo `AUTH_MODE=dev`), 401.

## Limpieza

Parados uvicorn 8001 y 8002, proxy 8000 y `next start` 3010; base `rgb48` eliminada. Los scripts de Playwright quedaron fuera del repo.

# RGB-48 · Juez

Veredicto: **APROBADO**.

## Evidencia propia

- `npm run lint`: 0 errores, 3 avisos preexistentes ajenos. `npm run typecheck`: verde. `npx jest`: 94 suites, 2096 tests en verde. `npm run build`: verde.
- Alcance: `frontend/app/settings/page.tsx` monta `TeamEditor` bajo plan y scoring; `frontend/lib/members.ts` y `frontend/components/settings/TeamEditor.tsx` cubren listar, invitar y retirar. Sin cambios en `backend/`, sin ocultar secciones por rol, sin edición de roles. El front muestra los errores del servidor (403, 409, 422) tal cual.
- Tests del Escritor (`TeamEditor.test.tsx`, `members.test.ts`, `settings.test.tsx`): sin cambios desde 4dd55bc (`git diff 4dd55bc HEAD` solo toca ficheros de RGB-2c llegados con el merge de main).
- Seguridad y reglas: solo correos `@example.com`, sin secretos; los correos se renderizan como texto de React (sin `dangerouslySetInnerHTML`; el Tester comprobó el XSS sembrado); identificadores en inglés, interfaz en español.
- Pantallazos: 29 ficheros en `screenshots/`, claro y oscuro, datos ficticios, referenciados en el informe del Tester. Revisados `team-list-light` y `invite-error-403-dark`: corresponden al cambio.

## Hallazgos del Tester: ninguno bloqueante

- Correo cliente/API: el cliente solo rechaza direcciones malformadas (`a@b..c`, `a@.com`, sin dominio con punto), que no son direcciones legítimas; acepta `+`, subdominios y mayúsculas. No impide invitar a una persona legítima.
- Seguimiento (menor): título visible «Invitar a una persona» (hoy solo `aria-label`); nombre accesible del contenedor de foco tras retirar (`tableWrapRef` en `TeamEditor.tsx`) o enfocar el aviso `status`; 403 al listar con rol `architect` sin probar; desbordamiento a 320 px es del shell (ya en RGB-16).
