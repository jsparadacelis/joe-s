# RGB-17a · Registro del Tester (dos rondas)

Rama `feat/RGB-17-sheet-read`. Verificación de punta a punta con el build real de Next (`next build` + `next start` en el 3010, `NEXT_PUBLIC_API_URL=http://localhost:8000`) contra el back real (uvicorn) y el Postgres local de docker `back-db-1` (puerto 54329, migraciones al día). Solo local: nada de Supabase, Cloud Run ni Vercel. Datos ficticios. El Tester no tocó código de producción ni de tests. Veredicto del Juez: pendiente.

**Segunda ronda:** tras los cambios del Desarrollador (`traffic_light` opcional con source `auto`, etiquetas «automático»/«del scoring», `break-words`, aviso de error con prefijo) se reconstruyó el front, se reinició uvicorn (puerto 8001 tras un proxy de fallos en el 8000, Next en el 3010) y se repitió todo con datos ficticios, sin interceptar peticiones. Todos los pantallazos se regeneraron.

## Qué se hizo (17a)

Ficha del proyecto de solo lectura en la fase 1: `GET /api/projects/{code}/sheet` (dominio `project_sheet.py`, caso de uso `get_project_sheet.py`, adaptador Postgres, ruta y cableado) y, en el front, `lib/sheet.ts` y `components/project/sheet/` (`ProjectSheet`, `SheetBlock`) montados en `/projects/[code]/phase/1` para proyectos reales. Ocho bloques, 20 obligatorios (el semáforo es opcional y automático); los campos «del scoring» se leen de la oportunidad, del plan confirmado y del scoring; los manuales salen vacíos y marcados hasta RGB-17b.

## Decisiones

- La completitud la calcula el dominio (un campo cuenta si no es nulo ni solo espacios); el front solo pinta.
- El back no copia los campos «del scoring» al contenido del entregable: fuente única.
- La ficha no tumba la página: 404 `sheet_not_found` se muestra como «Todavía no hay ficha para este proyecto.» y cualquier otro fallo de la API como aviso `role=alert` («No se pudo cargar la ficha del proyecto.» + motivo).
- Los proyectos de ejemplo conservan su vista (sin ficha).

## Ejecutado

- Cifras de tests aportadas por el Desarrollador (no reejecutadas por el Tester): back **1154**, front **1664**, en verde.
- `next build` en verde con la API en `localhost:8000`.
- Datos sembrados por la API (nada de SQL a mano): estudio de desarrollo, 6 oportunidades ficticias con scoring y promoción a Inicio con `POST /start` en local: `PRY-2026-916` (industrial, media), `917` (vivienda unifamiliar, pequeña), `918` (rehabilitación, grande, plan de 1 semana por fase, textos de 120/120/200 caracteres), `920` (textos de 120/120/200 caracteres sin espacios), `921` (HTML y comillas en los textos); `PRY-2026-919` se queda en fase 0.
- Para provocar fallos sin interceptar el navegador, un proxy local en el 8000 reenvía al uvicorn (8001) y, a petición, responde 500 (con y sin cuerpo `detail`), cierra la conexión, devuelve HTML, una forma errónea o tarda 20 s solo en `/sheet`. El navegador y el servidor de Next hablan con el proxy como con una API real.
- Playwright (Chromium, `es-ES`), claro y oscuro, con axe-core (wcag2a/aa/21aa y best-practice; en una segunda pasada, todas las reglas): sin violaciones en ficha recién promovida, otros campos, textos largos, fase 0 sin ficha y error.
- Procesos parados al terminar (uvicorn, proxy, next del 3010). `back-db-1` ya existía y se deja como estaba. El `next-server` del 3000 es ajeno y no se tocó.

## Criterios

| Criterio | Resultado |
|---|---|
| Los campos obligatorios vacíos se marcan | **Cumple.** Cada vacío obligatorio muestra «Obligatorio · falta» (texto, no solo color) y se repite en el resumen «Faltan por rellenar:» (13 en la ficha recién promovida). Los opcionales vacíos (Equipo, Colaboradores externos) llevan «—», sin marca. |
| Cada bloque indica si está completo o cuántos faltan | **Cumple.** Cada bloque lleva «Falta 1», «Faltan N» o «Completo»; en la ficha recién promovida: Identificación falta 1, Encargo 3, Gobierno 3, Cliente 1, Tiempo 2, Riesgo 2, Información 1 y **Estado «Completo»** (sin obligatorios); resumen «35 % completa · 7 de 20». Un bloque manual completo no se puede ver hasta 17b. |
| Etiqueta «del scoring» | **Cumple.** Nombre, cliente, ubicación, tipología, escala y plan confirmado llevan «del scoring»; el código y el semáforo llevan «automático» (el semáforo vacío muestra «—» sin etiqueta). |
| 404 claros | **Cumple.** API: `project_not_found` («No existe el proyecto PRY-2026-999.») y `sheet_not_found` («El proyecto aún no tiene ficha: es una oportunidad (fase 0).»). Pantalla: proyecto inexistente, 404 de Next; fase 0, «Todavía no hay ficha para este proyecto.» |
| Ninguna acción de IA cambia el estado; sin escrituras | **Cumple.** Sin peticiones distintas de GET al cargar la página (medido en claro y oscuro) y sin errores de consola. |

## Pruebas adicionales

- **Contraste y tema:** axe sin violaciones de contraste en claro y oscuro; las marcas rojas/ámbar/gris se leen en ambos.
- **Teclado:** la ficha no tiene elementos interactivos (0 focusables dentro); el orden de tabulación recorre el menú, las pestañas, las fases y «Guardar» del entregable sin trampas ni foco perdido. Hay «Saltar al contenido».
- **Lector de pantalla (árbol de roles, no un lector real):** h1 → h2 «Entregable · Inicio» → h2 «Ficha del proyecto» → h3 por bloque; cada bloque es una `section` con nombre (`aria-labelledby`); el resumen es `role=status` `aria-live=polite`; el aviso de error es `role=alert`. Las etiquetas y valores son `span` en un `li` (no una lista de definiciones): se leen en orden, sin asociación programática (hallazgo 8).
- **Anchos de escritorio:** 1024, 1280, 1440 y 1920 px, sin desbordamiento horizontal con textos normales ni con los largos con espacios (120/120/200). A 640 px tampoco. Con textos de 120 caracteres sin espacios la ficha ya no desborda (ver hallazgo 3).
- **Plan de 1 semana:** «7 semanas» en total y «1 semana» (singular) por fase.
- **HTML en los textos:** `<b>`, `<script>` y comillas se muestran como texto; 0 elementos inyectados.
- **Errores del back con la página real:** 500 sin cuerpo → «No se pudo cargar la ficha del proyecto. Ocurrió un error inesperado. Inténtalo de nuevo.»; 500 con `detail` → «No se pudo cargar la ficha del proyecto. La base de datos no responde.»; conexión cortada → «No se pudo conectar con el servidor…»; HTML o forma inválida → «La respuesta de la ficha no es válida. Inténtalo de nuevo.». Siempre `role=alert`, y el resto de la página (fases, entregable) sigue funcionando.
- **Vistas:** la ficha no aparece en las fases 0, 2 ni en proyectos distintos de la fase 1 (solo en `/phase/1`).

## Hallazgos

Severidad: Bloqueante, Alta, Media, Baja, Info. **No hay bloqueantes ni altos.**

### Resueltos y reverificados en la segunda ronda

1. **Baja, resuelto.** Semáforo vacío con «Obligatorio · falta» y «del scoring»: ahora es opcional, source `auto`, muestra «—» y la etiqueta «automático» solo en campos auto con valor; «del scoring» solo con source `scoring` y valor (6 en la ficha recién promovida: nombre, cliente, ubicación, tipología, escala, plan).
2. **Media, resuelto.** El bloque «Estado» ya sale «Completo» (0 de 0) y la ficha recién promovida marca **35 % · 7 de 20** (API y pantalla); ya no bloquea la completitud para RGB-19.
3. **Baja, resuelto en la ficha.** Con 120 caracteres sin espacios (`PRY-2026-920`) ninguna fila de la ficha desborda (0 elementos fuera de 1280 px). Sigue abierto, **fuera de alcance y previo a la tarea**, que el `h1` y el subtítulo de la cabecera desbordan la página (`scrollWidth` 2234) en todas las fases.
4. **Baja, resuelto.** El aviso dice «No se pudo cargar la ficha del proyecto.» seguido del motivo (con y sin `detail`), con `role=alert`. No hay botón de reintentar (mejora opcional).
6. **Baja, resuelto.** La etiqueta del plan confirmado va junto a «65 semanas» (ya no queda sola bajo las filas).

### Seguimientos abiertos (a propósito)

5. **Baja.** No hay límite de tiempo en la carga de la ficha: con 20 s de retraso en `/sheet`, toda la página espera 20 s (la petición se hace en el servidor, en serie con el resto).
8. **Info.** Etiqueta y valor no están asociados semánticamente (no hay `dl`/`dt`/`dd`); un lector los lee en orden. El porcentaje se lee fragmentado en el árbol de accesibilidad.
7. **Info.** El entregable de la fase 1 sigue mostrando «Guardar» encima de una ficha «solo lectura», también en el estado de error (hasta 17b).
9. **Info.** El ejemplo del contrato del plan (16 obligatorios) no coincide con la realidad (20); es solo un ejemplo del plan.
10. **Info.** A 360 px el shell desborda por la barra lateral fija (previo; plataforma de escritorio).
11. **Info (entorno).** Hay un `next-server` ajeno en el puerto 3000; la verificación usó el 3010.
12. **Info (previo).** Cabecera con textos sin espacios: ver hallazgo 3.

### Regresiones

Ninguna: axe sin violaciones en claro y oscuro (ficha recién promovida, otros campos, textos largos, fase 0 y error), sin desbordamiento a 1024, 1280, 1440 y 1920 px salvo la cabecera del hallazgo 3, sin peticiones distintas de GET y sin errores de consola.

## Pantallazos

[screenshots/](screenshots/), 1280 px, página completa (el menú lateral sticky aparece partido por la captura), claro y oscuro, con el build real y la API real, datos ficticios:

- `sheet-fresh-light.png` / `sheet-fresh-dark.png`: ficha recién promovida (`PRY-2026-916`), 35 % (7 de 20), bloque Estado «Completo».
- `sheet-other-light.png` / `sheet-other-dark.png`: otra tipología y escala (`PRY-2026-917`).
- `sheet-long-oneweek-light.png` / `sheet-long-oneweek-dark.png`: textos largos y plan de 1 semana por fase (`PRY-2026-918`).
- `sheet-phase0-light.png` / `sheet-phase0-dark.png`: fase 0, «Todavía no hay ficha para este proyecto.» (`PRY-2026-919`).
- `sheet-error-light.png` / `sheet-error-dark.png`: el back responde 500 en la ficha.

## No verificado

Supabase, Cloud Run, Vercel (prohibido); roles reales por sesión (RGB-2/4); lector de pantalla real (solo árbol de roles y axe); el «Completo» de un bloque en la interfaz real (solo en tests hasta 17b); reejecución de las suites (cifras del Desarrollador).

## Veredicto del Juez

**APROBADO** (RGB-17a, ficha de solo lectura).

Cifras que obtuvo el Juez, ejecutadas de nuevo: `ruff check backend` sin errores; `pytest backend -q` con `DATABASE_URL=postgresql://rgb:rgb@localhost:54329/rgb`, 1154 pasan, 0 saltados ni fallidos; `npm --prefix frontend run lint` y `typecheck` limpios; `npm --prefix frontend test`, 74 suites y 1664 tests en verde.

Razones:
- Criterio 1 (obligatorios vacíos marcados): cumple. Cada vacío obligatorio lleva «Obligatorio · falta» en texto y se repite en el resumen (comprobado en los pantallazos).
- Criterio 2 (cada bloque indica completo o cuántos faltan): cumple. Aparecen «Falta 1», «Faltan N» y «Completo» (Estado, 0 de 0). El resumen dice 35 % · 7 de 20.
- DDD: dominio puro (`project_sheet.py` no importa nada externo), caso de uso con puertos, adaptador Postgres y test de arquitectura ampliado.
- RLS: la ruta lee dentro de `study_transaction`, y hay tests contra Postgres real de que otro estudio no ve el proyecto ni el contenido.
- Solo lectura: un único GET, sin migración, sin cambio de estado y sin IA.
- Idioma: código en inglés, interfaz en español, datos ficticios.
- TDD: hay tests de dominio, caso de uso, rutas, infraestructura y front para cada pieza. El cambio por el semáforo (opcional y `auto`) está justificado en el plan y en el log, y no debilita los tests: corrige un requisito que impedía completar la ficha.
- Pantallazos: 10 archivos en `screenshots/`, en claro y oscuro, referenciados en el log. Los dos de `sheet-fresh` que abrió el Juez corresponden al cambio actual (35 %, bloque Estado «Completo», etiquetas «del scoring» y «automático»).
- Los hallazgos abiertos (5 timeout, 8 `dl`, 3/12 cabecera que desborda, 9 ejemplo del plan) son seguimientos, ninguno bloqueante.

Seguimientos:
1. Poner un límite de tiempo a la carga de la ficha (hallazgo 5).
2. Usar `dl`/`dt`/`dd` para asociar etiqueta y valor (hallazgo 8).
3. Arreglar el desbordamiento de la cabecera con textos sin espacios (previo a la tarea).
4. Corregir el ejemplo del contrato del plan: dice 16 obligatorios y son 20.
5. «Guardar» encima de una ficha de solo lectura queda hasta 17b.
6. `.mcp.json` está sin seguimiento y no es parte de la tarea: no incluirlo en el commit ni en el PR (conviene añadirlo a `.gitignore`).

---

# RGB-17b · Registro del Tester

Rama `feat/RGB-17b-sheet-edit`. Verificación de punta a punta con el build real de Next (`next build` + `next start` en el 3010, `NEXT_PUBLIC_API_URL=http://localhost:8000`) contra uvicorn real y el Postgres local `back-db-1` (54329, migraciones al día). Solo local: nada de Supabase, Cloud Run ni Vercel. Datos ficticios. El Tester no tocó código de producción ni de tests. Veredicto del Juez: pendiente.

## Qué se hizo (17b)

`PUT /api/projects/{code}/sheet` (campos manuales y plan recalculado en el contenido del entregable de la fase 1, sin migración; la línea base `project_plans` no se toca) y, en el front, edición por bloque («Editar X», formulario con etiquetas, errores por campo, «Guardar»/«Cancelar»), selector de tipología y escala con plan propuesto editable y «Confirmar recálculo». Solo editable con el proyecto en la fase 1.

## Ejecutado

- Cifras del Desarrollador (no reejecutadas por el Tester): primera ronda back **1336**, front **1755**; segunda ronda back **1355**, front **1763**, en verde. `next build` en verde.
- Entorno: uvicorn con rol `partner` (8001), otro con `architect` (8002) y otro con `director` (8003) por `DEV_ROLE`; un proxy local en el 8000 reenvía al 8001 y, a petición, responde 500 (con y sin `detail`), corta la conexión, devuelve HTML, añade latencia al PUT o falla `GET /api/plan`, y puede enviar el PUT al 8002 (403). No se interceptó el navegador. Proyectos ficticios `PRY-2026-922…941` sembrados por la API (oportunidad, scoring, `/start`); el paso a fase 2 con el entregable marcado completo y aprobado en la BD local.
- Playwright (Chromium, `es-ES`), claro y oscuro, axe-core (todas las reglas).

## Criterios

| Criterio | Resultado |
|---|---|
| Los obligatorios vacíos se marcan y al rellenarlos la ficha lo refleja al guardar | **Cumple.** Se rellenó cada bloque desde la pantalla (7 PUT): 35 % -> 100 % «20 de 20», sin lista «Faltan por rellenar», y la API devuelve cada valor. Persiste al recargar. |
| Cada bloque indica completo o cuántos faltan, y se actualiza | **Cumple.** «Falta 1»/«Faltan N» pasan a «Completo» al guardar los 7 bloques; Estado ya era «Completo»; los 8 en «Completo» al 100 %. Borrar un valor (vacío o solo espacios) vuelve a «Falta 1», 95 % · 19 de 20, y vuelve a la lista de faltas; la API da `null`. |
| Cambiar tipología o escala recalcula el plan con confirmación | **Cumple.** Aviso explícito, plan propuesto igual a `GET /api/plan`, siete semanas editables, total en vivo, botón «Confirmar recálculo» (no hay «Guardar» hasta confirmar). La ficha muestra el plan nuevo (75 semanas, tipología y escala nuevas) y persiste. `project_plans` queda idéntico (1 fila, semanas originales, mismo `confirmed_by`) y `GET /api/projects/{code}/plan` no cambia. |
| Sin cambios de estado; cada guardado, en la auditoría | **Cumple.** La fase no cambia con ninguna operación. Auditoría `project_sheet`: `update` (valores anteriores y nuevos de los campos tocados), `recalculate_plan` (plan anterior y nuevo) y `update`/`rejected` con el código del error (`invalid_field`, `unknown_field`, `invalid_request`, `invalid_weeks`, `invalid_scale`, `invalid_project_type`, `no_authority`, `sheet_not_editable`). |

## Pruebas adicionales

- **422 junto al campo:** texto de 201 caracteres (campo corto) y de 2001 (área de texto): mensaje bajo el campo, `aria-invalid`, `aria-describedby`, foco en el campo, el resto del borrador intacto, sin aviso genérico; el error se borra al teclear. Fecha: el control `type=date` impide fechas inválidas; solo se alcanza el 422 con un año de 6 dígitos (`275760-01-01`), que se muestra junto al campo. Semanas inválidas (0, vacío, 521, 2,5, -3): sin PUT, error y foco en la primera inválida.
- **API (422):** cuerpo vacío, `fields` lista, clave desconocida o no editable (`code`, `name`, `project_type`, `traffic_light`), valores no texto, fechas (`2026-02-30`, mes 13, con hora, dígitos Unicode, año 0000), 200/201 y 2000/2001 caracteres, recorte de espacios, plan con tipología/escala inválida, 6 semanas, 0, 521, 2,5, `2.0`, bool y cadenas; todo atómico (un campo malo no guarda los buenos).
- **Cancelar, Escape y teclado:** Cancelar y Escape no guardan (sin PUT, API intacta), el foco vuelve a «Editar X» y al reabrir se muestra el valor guardado. Guardar sin cambios cierra sin PUT. Orden de tabulación: campos -> Guardar -> Cancelar -> siguiente bloque. Enter en un campo guarda; Enter en el área de texto inserta salto de línea. Escape se ignora mientras se guarda.
- **Foco tras guardar:** al «Cambios guardados» (`role=status`, `tabIndex=-1`).
- **Doble clic en Guardar y Enter repetido** (latencia de 1,5 s): un único PUT, «Guardando…» deshabilitado, campos y Cancelar deshabilitados. Doble clic en «Confirmar recálculo»: un PUT.
- **Dos pestañas:** gana la última escritura en el mismo campo; los campos distintos de cada pestaña se conservan (fusión de claves). La pestaña que guardó primero queda desactualizada hasta recargar. 12 PUT en paralelo a campos distintos: todos presentes; 12 al mismo campo: gana uno, 24 eventos de auditoría, ninguno perdido.
- **403:** `architect` -> 403 `no_authority` por API (también con cuerpo inválido: el 403 gana) y en pantalla «No tienes autoridad para esta acción en la fase 1. Pueden hacerlo: Socio, Director.» en el formulario, sin guardar nada y con el borrador intacto. Rechazo auditado.
- **409:** proyecto en fase 0 y en fase 2 (partner y architect): 409 `sheet_not_editable`. En pantalla (proyecto promovido en otra pestaña con el formulario abierto): «La ficha solo se puede editar mientras el proyecto está en la fase 1.»; al recargar, sin botones «Editar» y con la descripción «Solo lectura…». Fases 0, 2, 3 y proyecto de ejemplo: sin ficha editable.
- **Errores de red:** 500 con `detail` («La base de datos no responde.»), 500 sin cuerpo, conexión cortada y HTML en un 200: aviso `role=alert`, borrador conservado, reintento posible y con éxito después.
- **Texto con HTML, emoji y comillas** (`<b>`, `<script>`, `<img onerror>`, comillas, `😀`, `«Ö»`, RTL): se muestra literal, 0 elementos inyectados, ningún script ejecutado, ida y vuelta idéntica en el formulario y tras recargar.
- **axe:** 0 violaciones, claro y oscuro, en la ficha al 100 %, bloque en edición, error de campo, recálculo abierto, error de semanas, aviso genérico, 403, 409, solo lectura en fase 2, y los 7 bloques en edición a la vez con recálculo.
- **Anchos 1024, 1280, 1440 y 1920 px**, claro y oscuro, todos los bloques en edición, recálculo abierto y 420 caracteres sin espacios: sin desbordamiento horizontal de la página ni de los bloques.
- **Carrera de recálculo:** dos cambios de tipología seguidos con latencia en `GET /api/plan`: las semanas son las de la última elección.
- Consola sin errores salvo los registros del navegador de las respuestas 4xx/5xx provocadas.

## Hallazgos

Severidad: Bloqueante, Alta, Media, Baja, Info. **No hay bloqueantes ni altos.**

1. **Media.** Un texto con carácter NUL (`\u0000`) o sustituto suelto (`\ud800`) devuelve 500 «Internal Server Error» (PostgreSQL rechaza el NUL en `jsonb`; el dominio no lo valida). Repro: `PUT /api/projects/PRY-2026-923/sheet` con `{"fields":{"main_risk":"a\u0000b"}}`. En la interfaz sale «Ocurrió un error inesperado»; no se audita (la transacción se revierte). Pegar un NUL desde el portapapeles es raro, pero es un 500 evitable (rechazar con 422 `invalid_field`).
2. **Media/Baja (accesibilidad).** Tras un error (aviso genérico, 403, 409) el foco queda en `body`: «Guardar» se deshabilita durante el envío y no se devuelve el foco. El aviso es `role=alert` y se anuncia, pero quien usa teclado pierde su sitio. En RGB-16 el foco iba al aviso. Los errores de campo sí llevan el foco.
3. **Baja.** Si falla la carga del plan al cambiar tipología o escala, el formulario solo ofrece «Cancelar»: no se puede guardar otro campo editado del bloque sin volver a la tipología original. Con el plan cargando, Enter en un campo se ignora en silencio (sin PUT ni aviso).
4. **Baja.** El mensaje de la API usa «Sponsor» («El campo «Sponsor» no es válido…»), mientras que la interfaz dice «Promotor»; el texto visible mezcla idiomas. Los demás nombres están en español.
5. **Baja.** Escape (y Cancelar) descartan el borrador sin avisar, también desde el área de texto.
6. **Baja.** Cambiar tipología o escala descarta las semanas ya editadas (ya conocido de RGB-16, hallazgo 5).
7. **Baja.** Una fecha a medio teclear en el `type=date` queda como valor vacío y, al guardar, borra la fecha anterior sin aviso (el control del navegador no deja pasar fechas inválidas; solo se vio con valores tecleados raros).
8. **Info (decisión del plan).** El plan recalculado vive solo en la ficha: `GET /api/projects/{code}/plan` y otras vistas (`/plan-and-timing`, cartera) siguen con la línea base. Hay dos «planes» hasta que RGB-19 los reconcilie. Además `/plan-and-timing` de un proyecto en fase 1 con plan confirmado dice «El plan base de semanas todavía no está confirmado» (previo a 17b).
9. **Info.** Guardar un valor idéntico al almacenado, enviado por API, genera un evento `update` y reescribe el contenido; desde la pantalla no ocurre (no se envía sin cambios). Una pestaña desactualizada puede no restaurar un valor que alguien cambió si el usuario lo vuelve a su valor inicial (solo se envían los campos tocados).
10. **Info.** El orden de comprobación es proyecto -> fase -> autoridad -> validación, así que un rol sin autoridad recibe 409 en fases 0 y 2+ (igual que RGB-16, hallazgo 6).
11. **Info.** El «Guardar» del entregable de la fase 1 sigue sin hacer nada y convive con los «Guardar» de cada bloque (seguimiento 5 de 17a).
12. **Info.** Con `1e2` en una semana se envía 100 (válido, como en RGB-16).
13. **Info (entorno).** `next-server` ajeno en el 3000 (no se tocó); la verificación usó el 3010.

## Pantallazos

[screenshots/](screenshots/), claro y oscuro, build real y API real, datos ficticios (recortes de bloque a 1280 px; la ficha completa es de página entera, con el menú lateral sticky partido por la captura):

- `edit-block-*`: bloque Gobierno en edición.
- `edit-errors-*`: error de campo (texto de más de 200 caracteres).
- `edit-saved-*`: bloque tras guardar («Completo» y «Cambios guardados»).
- `edit-recalc-*`: recálculo del plan con aviso, semanas y «Confirmar recálculo»; `edit-recalc-error-*`: semana inválida.
- `edit-complete-*`: ficha al 100 %, todos los bloques «Completo».
- `edit-403-*` y `edit-409-*`: avisos de autoridad y de fase.
- `edit-readonly-phase2-*`: la ficha de un proyecto en fase 2, sin «Editar».

## No verificado

Supabase, Cloud Run y Vercel (prohibido); roles reales por sesión (RGB-2/4: el rol sale de `DEV_ROLE`); lector de pantalla real (solo axe y árbol de roles); reejecución de las suites (cifras del Desarrollador).

## Segunda ronda (RGB-17b)

Cambios del Desarrollador: back 1355 tests (`\u0000` y sustitutos sueltos dan 422 `invalid_field` con `field` y «contiene caracteres no permitidos»; los mensajes usan las etiquetas de la interfaz) y front 1763 tests (foco al aviso tras un fallo, «Reintentar» si falla el plan propuesto, aviso «Espera a que termine de calcularse el plan», fecha incompleta que no se envía). Se reconstruyó el front (`next build`, `next start` en el 3010) y se reiniciaron los uvicorn (8001 `partner`, 8002 `architect`) con el código nuevo; el proxy de fallos en el 8000. Sin interceptar el navegador. Proyectos ficticios nuevos; todos los scripts de la primera ronda se repitieron como regresión.

| Hallazgo | Estado | Verificación con el build real |
|---|---|---|
| 1. NUL / sustituto suelto -> 500 | **Resuelto** | API: 422 `invalid_field` con `field: main_risk` y «El campo «Riesgo principal» no es válido: contiene caracteres no permitidos.» (NUL y `\ud800`). En pantalla: el mensaje sale junto al campo, con el foco en él y sin aviso genérico; corregido el texto, guarda. axe sin violaciones en claro y oscuro. |
| 2. Foco perdido tras un error | **Resuelto** | Tras 500 con `detail`, 500 sin cuerpo, conexión cortada, HTML en un 200, 403 y 409, el foco queda en el aviso `role=alert` (`tabIndex=-1`). axe sin violaciones con el aviso enfocado. |
| 3. Fallo del plan sin salida / Enter ignorado | **Resuelto** | Con `GET /api/plan` fallando: aviso + «Reintentar» + «Cancelar», borrador conservado; al reintentar (con latencia) «Cargando plan…», y al terminar aparecen las semanas y «Confirmar recálculo»; se guardó el campo y el plan juntos. Enter con el plan cargando: «Espera a que termine de calcularse el plan», sin PUT. |
| 4. «Sponsor» en el mensaje de la API | **Resuelto** | «El campo «Promotor» no es válido…» y ««Dirección del proyecto»…» por API y en pantalla. |
| 7. Fecha a medio teclear borra la anterior | **Resuelto en lo importante, con matiz (Baja)** | La fecha previa no se borra: al vaciar un segmento (`badInput`) no se envía ningún PUT y la API conserva `2026-11-03`; vaciarla del todo sí la borra. Pero el aviso «Fecha incompleta» de la aplicación **no llega a verse**: el `<form>` no lleva `noValidate`, el navegador bloquea el envío antes (`checkValidity()` falso, tooltip nativo «Please enter a valid value. The field is incomplete…», en el idioma del navegador) y el `submit` de la aplicación no se ejecuta. Repro: «Editar Encargo», borrar solo el día de la fecha con Retroceso, pulsar «Guardar». Propuesta: `noValidate` en el formulario para que salga el mensaje en español junto al campo. |

**Seguimientos a propósito** (sin cambios): 5 (Escape/Cancelar descartan el borrador), 6 (cambiar de escala descarta las semanas editadas) y 8 (el plan recalculado vive solo en la ficha), además de 9 a 13.

**Regresiones:** ninguna. Flujo 35 % -> 100 % repetido (7 bloques, 7 PUT, «Completo» en los 8, borrado vuelve a «Falta 1», 95 %); 422 junto al campo, Cancelar/Escape, doble clic y Enter repetido con un solo PUT, HTML y emoji literales, 403 y 409 en pantalla, dos pestañas (última escritura gana, campos distintos conservados), recálculo con confirmación; `project_plans` idéntico (1 fila, semanas originales) y `GET /projects/{code}/plan` sin cambios; fase sin cambios. axe sin violaciones en claro y oscuro en edición, error de campo, caracteres no permitidos, «Reintentar», «Espera…», avisos con foco, 403, 409, recálculo y error de semanas. Sin desbordamiento a 1024, 1280, 1440 y 1920 px con todos los bloques en edición y recálculo abierto.

**Pantallazos regenerados y nuevos** (claro y oscuro, `screenshots/`): todos los `edit-*` anteriores regenerados con el build nuevo, y nuevos `edit-forbidden-chars-*` (error de campo por caracteres no permitidos), `edit-plan-retry-*` («Reintentar» tras fallar el plan) y `edit-plan-wait-*` (aviso «Espera a que termine de calcularse el plan»). No hay pantallazo de «Fecha incompleta» porque el aviso de la aplicación no se muestra (ver hallazgo 7).

---

## Veredicto del Juez (17b)

**APROBADO** (RGB-17b, edición de la ficha y recálculo del plan).

Cifras que obtuvo el Juez, ejecutadas de nuevo: `ruff check backend` sin errores; `pytest backend -q` con `DATABASE_URL=postgresql://rgb:rgb@localhost:54329/rgb` (entorno `.venv-back`), 1355 pasan, 0 saltados ni fallidos; `npm --prefix frontend run lint` y `typecheck` limpios; `npm --prefix frontend test`, 78 suites y 1764 tests en verde.

Razones:
- Criterios del plan: cumplen. Obligatorios vacíos marcados y reflejados al guardar (pantallazo `edit-complete-*`: 100 %, 20 de 20, todos los bloques «Completo»); recálculo con aviso, semanas editables y «Confirmar recálculo» (`edit-recalc-*`); sin cambio de fase (el caso de uso no toca el estado ni la línea base `project_plans`); cada guardado (`update`, `recalculate_plan`) y cada rechazo quedan en la auditoría (caso de uso y tests contra Postgres real).
- DDD: validación en dominio puro (`project_sheet.py`, `text.py`, `errors.py`), caso de uso con puertos, adaptador Postgres y ruta delgada. Sin migración.
- Autoridad solo de fase 1 y solo en fase 1 (409/403 auditados); ninguna acción de IA.
- TDD: hay tests nuevos para cada capa (dominio, caso de uso, rutas, rutas con Postgres, infraestructura, front de lib, bloque, ficha y página). Los tests ya existentes solo se ampliaron (el único modificado, `sheet-phase-page.test.tsx`, solo tiene líneas añadidas); nada debilitado.
- Seguridad: consulta parametrizada, `Jsonb`, RLS vía `study_transaction`, longitud y NUL/sustitutos validados (422), React escapa el texto.
- Accesibilidad: etiquetas, `aria-invalid`/`aria-describedby`, foco al error y al aviso, `role=alert`/`status`, axe sin violaciones (Tester).
- Idioma: código en inglés, interfaz en español, datos ficticios.
- Pantallazos: 12 pares `edit-*` más 3 pares nuevos, claro y oscuro, abiertos (recálculo, errores, 403, 409 y completo): corresponden al cambio.
- `.mcp.json` sigue sin seguimiento: no incluirlo en el commit ni el PR.

Seguimientos (ninguno bloqueante):
1. Última escritura gana, sin control de versión (RGB-19 o posterior).
2. Hallazgo 5 (Escape/Cancelar descartan el borrador), 6 (cambiar escala descarta semanas editadas) y 8 (dos planes: ficha vs línea base hasta RGB-19).
3. Hallazgo 7: el aviso «Fecha incompleta» no se muestra porque el navegador bloquea el envío; hoy `<form>` ya lleva `noValidate` en el código, reverificar con el build real.
4. De 17a: timeout de carga de la ficha, `dl`/`dt`/`dd`, desbordamiento de la cabecera, ejemplo del plan (16 vs 20 obligatorios) y «Guardar» del entregable que convive con los de bloque.
5. Añadir `.mcp.json` a `.gitignore`.
