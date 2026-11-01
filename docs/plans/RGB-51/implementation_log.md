# RGB-51 · Tester

Rama `rgb-51/connect-technical-data`. Veredicto del Tester: **APROBADO**, sin bloqueantes. Hay hallazgos de gravedad media y baja (abajo), ninguno corrompe datos ni se salta un permiso. Pantallazos en [`screenshots/`](screenshots/) (46 ficheros, claro y oscuro, 1280 px página completa salvo `23-320px`). Datos ficticios. No se tocó código de producción ni tests.

## Resultados de las comprobaciones

| Comprobación | Resultado |
|---|---|
| `npm run lint` | 0 errores, 3 avisos preexistentes (`PromotePanel.test.tsx`, `auth.test.ts` x2) |
| `npm run typecheck` | verde |
| `npm test` (suite completa) | 102 suites, **2296 tests** en verde |
| `npm run build` | verde |

## Entorno

`next build` + `next start` (3010) contra uvicorn real y Postgres local `back-db-1` en una base propia `rgb51` (migraciones 001-013 + `seed_dev`; borrada al terminar). Un lanzador de pruebas arranca la app real con `dependency_overrides[cadastre_gateway]` sustituido por un gateway simulado que usa las respuestas grabadas de `backend/tests/external_data/infrastructure/fixtures` (nunca hay red hacia el Catastro; el gateway registra cada llamada). Referencias: una válida (fixture), una que da 404, una que da 503 y una segunda con otros valores (superficie 400, año 1999) para volver a consultar. Dos uvicorns en `AUTH_MODE=dev`: 8001 con rol `project_director` (puede editar) y 8002 con rol `architect` (sin autoridad), y un proxy en el 8000 que elige el uvicorn y añade latencia o errores. Proyectos `PRY-T-001..005` insertados en la base (fases 2, 2, 3, 2, 2).

## Verificación de `/projects/<code>/phase/2`

- **Carga y vacío:** «Cargando datos técnicos…» con `role=status`; sin consulta previa solo se ve la referencia y «Obtener datos técnicos» (sin catálogo). Un 500 con `{detail}` muestra el mensaje del servidor; un 500 sin cuerpo, «Ocurrió un error inesperado. Inténtalo de nuevo.» (`20-load-error-*`).
- **Referencia (RGB-18):** vacía «Introduce la referencia catastral.», 3 caracteres «tiene 20 caracteres (14 de la parcela y 6 del inmueble) y has escrito 3», 14 «Has escrito 14 caracteres: es la referencia de la parcela…», símbolos «solo puede llevar letras y números»; `aria-invalid` en el campo y **ninguna** llamada a la API ni al Catastro (`02..04-*`).
- **404 del Catastro:** «No se encontró esa referencia en el Catastro.» con el foco en el aviso, sin ruta manual, nada guardado (`05-*`). **503:** «No se pudo consultar el Catastro. Introduce los datos a mano.» y botón «Introducir datos manualmente», nada guardado (`06-*`). La ruta manual muestra el catálogo vacío y editar planeamiento guarda en el servidor como `manual` sin original (`19-*`). Con datos ya consultados el 503 no toca nada y no ofrece la ruta manual (`09-*`).
- **Obtener con referencia válida:** dirección, municipio, clase (Urbano), uso (Residencial), año, superficie construida y coordenadas rellenos; fecha «Consultado el 1 nov 2026»; la superficie de parcela catastral no la trae la respuesta grabada y se avisa «No se pudieron rellenar: Sup. de parcela (Catastro). Introdúcelos a mano.» (`08-*`). Altitud, pendiente, tipo de pendiente, polígono, zonas del CTE y planeamiento quedan sin valor («Sin dato»/vacío) y la capacidad pide planeamiento.
- **«Consultando…»**: botón deshabilitado, doble clic: una sola llamada al Catastro (`07-*`).
- **Editar:** texto (con «Guardando…», fila deshabilitada y foco devuelto al campo, `10-*`), número (`abc` y `1995,5` → 422 «Introduce un número, con coma o punto decimal.» junto al dato, con `aria-invalid`, `aria-describedby`, `role=alert`, borrador conservado y nada guardado; `1995` ok; `-3` → «El valor debe estar entre 0 y 10000000.»; `11-*`), lista (Clase, Zona climática), 201 caracteres y vacío/blanco → 422. Aparecen «Editado» y «Valor de Catastro: …».
- **Restaurar, verificar, «Marcar todo»:** restaurar vuelve al original; verificar deja la casilla marcada y deshabilitada (no se puede desmarcar, tampoco forzando el clic); editar un dato verificado lo deja sin verificar; «Marcar todo» verifica los datos con valor (`12-*`, `13-*`).
- **Volver a consultar (`14-*`):** conserva la dirección y el año editados (y su verificado), actualiza la superficie construida no editada (308 a 400, pierde el verificado por cambiar), mantiene el municipio verificado y todo el planeamiento manual con su verificado; el `original` de los editados pasa a 1999.
- **Sin autoridad (rol `architect`):** lee los datos; al editar, el servidor responde 403 «No tienes autoridad para esta acción en la fase 2. Pueden hacerlo: Director de proyecto.», mostrado en un aviso con el foco, y la pantalla queda en solo lectura (campos, referencia y botones deshabilitados); igual al verificar, «Marcar todo» y volver a consultar; nada guardado (`15-*`).
- **Fase distinta de 2:** con la pantalla abierta y el proyecto movido a la fase 3, editar da 409 «Los datos técnicos solo se pueden cambiar mientras el proyecto está en la fase 2 (Briefing).» y queda en solo lectura (`16-*`). Un proyecto que ya está en la fase 3 muestra la fase 2 en solo lectura con los datos del servidor (`17-*`).
- **Ejemplos `PRY-EJ-00N`:** se renderizan con datos locales; **cero** llamadas a `/technical-data` (registro del proxy), cero al Catastro y cero eventos de auditoría (`18-*`).
- **Base de datos:** cada operación dejó su evento en `audit_events`: `edit` ok 42 / rechazado 26, `refresh` ok 18 / rechazado 4 (403), `restore` 7, `verify` 7 ok / 2 rechazados, `verify_all` 4 ok / 2 rechazados; los rechazos por permiso (403) y por valor (422) también se auditan. Las filas de `technical_data` reflejaron exactamente lo mostrado (valor, `original`, `verified`, `source`) y `technical_data_queries` la última consulta. Los 404 y 503 del Catastro no generan evento ni cambian filas (coherente con «no se toca nada»).

## Intentar romper

- **Doble envío:** doble Enter, Enter seguido de Tab (blur), doble clic en verificar, restaurar, «Marcar todo» y «Volver a consultar» con 1,2 s de latencia: siempre una única petición.
- **Cambiar de dato mientras otro guarda:** la otra fila sigue habilitada; las dos ediciones llegan y se guardan; durante un guardado «Volver a consultar» y «Marcar todo» quedan deshabilitados (`21-*`).
- **XSS** (`<img src=x onerror=alert(1)>"><script>alert(2)</script>`): se guarda y se devuelve literal como texto, también en «Valor de Catastro», sin diálogos ni nodos inyectados (`22-*`).
- **Teclado:** tras guardar texto o lista el foco vuelve al campo; tras un 422 el foco se queda en el campo; el 403, 409 y 404 de Catastro llevan el foco al aviso.
- **Lector de pantalla** (`ariaSnapshot`): `textbox`/`combobox` con nombre, casilla «Verificado <dato>», botón «Restaurar <dato>», errores `role=alert`, carga `role=status`.
- **axe** (incluida `color-contrast`), claro y oscuro: 0 violaciones en vacío, errores de referencia, 404, 503, consultado, guardando, 422, editado, verificado, XSS, ejemplo, error de carga y 320 px. Excepción: hallazgo 2.

## Hallazgos

1. **Media. Se pierde el foco (pasa a `body`) tras verificar, restaurar, «Marcar todo» y «Volver a consultar».** La casilla queda deshabilitada, el botón «Restaurar» desaparece y los botones se deshabilitan durante la petición; el foco no se devuelve (solo se hace con los campos de texto y lista). Repro: Tab hasta «Verificado Dirección», Espacio, `document.activeElement` es `BODY`. Sugerencia: llevar el foco al campo del dato (o al botón al terminar) tras esas acciones.
2. **Media/Baja. axe `scrollable-region-focusable` (1 nodo) en solo lectura con un valor largo.** Con la pantalla bloqueada tras un 403/409, el input deshabilitado «Municipio» (`MUNICIPIO DE EJEMPLO (PROVINCIA DE EJEMPLO)`) desborda y axe lo trata como región desplazable no enfocable. Repro: rol `architect`, editar cualquier dato en un proyecto consultado y ejecutar axe. Sugerencia: `readOnly` en vez de `disabled`, o mostrar el valor como texto.
3. **Baja. Tras un 403/409 el borrador no guardado sigue en el campo.** En solo lectura el campo muestra el texto que la persona escribió («Intento sin autoridad», `15-*`) aunque el servidor no lo guardó: parece un dato guardado. Sugerencia: descartar el borrador al bloquear la pantalla (recargar el dato del servidor).
4. **Baja. «Sin dato» en las listas siempre da 422.** Elegir «Sin dato» en «Zona de viento» muestra «Elige una de estas opciones: A, B, C.» y no se puede vaciar ningún dato (texto vacío: «El valor no puede estar vacío.»). Es regla del backend (RGB-28); la opción «Sin dato» invita a algo que no existe.
5. **Info/Baja. «Todo verificado» solo se alcanza con los 26 datos con valor.** «Marcar todo» verifica los datos con valor (regla del dominio) y el resumen sigue en «N sin verificar» mientras haya datos vacíos (altitud, pendiente…, fuera de alcance). Está acorde con el plan, pero conviene saberlo.
6. **Info. La referencia catastral queda habilitada mientras se guarda un dato** (el botón está deshabilitado, así que no tiene efecto).
7. **Info, ya conocida y del shell. A 320 px** la barra lateral de 232 px deja la columna principal en ~88 px (`scrollWidth` 618); además el editor usa `grid-cols-2` fijo, sin versión de una columna (heredado de RGB-29). La plataforma es de escritorio (`23-320px-*`).
8. **Info. Los 404 y 503 del Catastro no se auditan** (no cambian nada); sí los 403 y 422.

## No verificado

Funciones por proyecto con `AUTH_MODE=supabase` y una asignación real de «Director de proyecto»: el director y el «sin autoridad» se simularon con el rol de estudio (`project_director` y `architect`, `DevProjectRoles`). Lector de pantalla real. Catastro real (a propósito). Una referencia cuyo uso no está en la lista (el aviso de «no mapeado» de un uso se vio solo para la superficie de parcela).

## Limpieza

Parados los uvicorn 8001 y 8002, el proxy 8000 y `next start` 3010; base `rgb51` eliminada. Los scripts quedaron fuera del repo (scratchpad).
