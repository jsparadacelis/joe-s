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
