# RGB-52 · Tester

Rama `rgb-52/connect-relief-viewer` (HEAD 585aa5a). Veredicto del Tester: **APROBADO**, sin bloqueantes. Hay hallazgos de gravedad media/baja (abajo); ninguno corrompe datos, se salta un permiso ni rompe el resto de la pantalla. No se tocó código de producción ni tests. Pantallazos en [`screenshots/`](screenshots/) (36 ficheros, claro y oscuro, 1280 px página completa salvo indicación, WebGL real por software; datos ficticios).

## Resultados de las comprobaciones

| Comprobación | Resultado |
|---|---|
| `npm run lint` | 0 errores, 3 avisos preexistentes (`PromotePanel.test.tsx`, `auth.test.ts` x2) |
| `npm run typecheck` | verde |
| `npm test` (suite completa) | 112 suites, **2642 tests** en verde |
| `npm run build` | verde |

## Entorno

`next build` + `next start` (3052) contra uvicorn real (8000) y Postgres local `back-db-1` en una base propia `rgb52` (migraciones 001-016 + `seed_dev`; borrada al terminar). Proyecto real `PRY-2026-001` creado con `POST /api/opportunities` y puesto en la fase 3. Un lanzador de pruebas (fuera del repo, en el scratchpad) arranca la app real y sustituye `plot_gateway` y `relief_gateway` por los gateways HTTP reales (`HttpPlotGateway`, `HttpReliefGateway`) sobre `httpx.MockTransport`: el WFS devuelve `wfs_parcel_ok.xml` / `wfs_parcel_not_found.xml` y el WCS devuelve `wcs_arcgrid_ok.asc` (la respuesta idéntica a la fixture cuando se pide su ventana: mismas 25 × 27 celdas y la misma caja en grados) o una rejilla remuestreada de ella para otras ventanas; así se ejercitan los parsers reales, la caché y la RLS. Nunca hubo red hacia el Catastro, el INSPIRE ni el IDEE. Referencias simuladas: la de la fixture (`4714805BC6841S0001AB`), 404 (WFS sin parcela), 503 del Catastro (WFS 503), 503 del relieve (WCS devuelve `ServiceExceptionReport`), celdas sin dato (`NODATA_value` en un bloque), parcela enorme (polígono x10, ventana recortada, 100 × 100 celdas con margen 100 y lado 500). El navegador (Chromium con Playwright, WebGL por software `swiftshader`) hace de proxy con `page.route`: registra cada petición a `/api/cadastre/**`, la reenvía al servidor real y, según el caso, la retrasa, la cambia (502, perímetro nulo) o la sustituye (422).

## Verificación de `/projects/<code>/phase/3` (proyecto real)

- **Petición al servidor:** al cargar la página no hay ninguna petición a `/relief`. «Ver relieve» pide `GET /api/cadastre/4714805BC6841S0001AB/relief?margin=25&max_side=200` (los valores por defecto del visor) y el servidor responde 200. Referencia en minúsculas y con espacios: se recorta y el servidor la acepta. Los registros del servidor (`api.log`) coinciden con los del proxy; no hay errores en `api.log` ni en la consola del navegador salvo el «Failed to load resource» esperado de los 4xx/5xx simulados.
- **Terreno y perímetro (`01-*`, `19-*`):** se pinta el MDT de la fixture (31,0–40,6 m bajo la parcela, 18,2–54,0 m en la ventana) con el perímetro INSPIRE sobre la malla. La forma (vértice norte, vértice este, punta sur) y la posición del polígono en la ventana (x 20–78 %, y 20–80 %) coinciden con las coordenadas de la fixture; vista cenital en `19-*`. Lecturas: 2906 m², 31,0–40,6 m, desnivel 9,6 m, pendiente 23,2 %, vista 125 × 131 m, fuente «MDT 5 m, IGN». Comprobación numérica con la respuesta: las alturas bajo el perímetro difieren como mucho 0,55 m entre colocar las celdas de borde a borde (como hace el visor) y en el centro de celda (ver hallazgo 7).
- **Recorte y Lado:** cada cambio vuelve a pedir (`margin=50&max_side=200`, `…&max_side=500`, `margin=0`…) y las lecturas (vista 175 × 181 m, etc.) se actualizan. **La exageración no pide** (0 peticiones nuevas; la lectura pasa a «×3 vertical»).
- **Carrera de dos peticiones lentas:** (A) margen 10 con 4 s de retraso y luego margen 50 rápido: se queda el resultado de 50 (175 × 181 m); cuando llega la lenta no lo pisa. (B) margen 0 lento (4 s) y luego 100 rápido: queda el de 100 (200 × 200 m, ventana recortada) y la lenta se descarta. Sin errores de consola.
- **Errores (`02-*` a `12-*`)**, en todos el resto de la pantalla (cabecera, fases, entregable «Guardar») queda intacto:
  - Referencia de 14 posiciones y con símbolo: validación local «La referencia catastral debe tener 20 caracteres.», `aria-invalid`, **0 peticiones**.
  - 422 del servidor: mensaje del servidor junto a la referencia (`aria-invalid=true`, `aria-describedby`), sin lienzo.
  - 404 `plot_not_found`: «No se encontró la parcela en el Catastro.» junto a la referencia.
  - 503 `cadastre_unavailable`: «No se pudo consultar el Catastro. Introduce los datos a mano.» (ver hallazgo 4). 503 `relief_unavailable`: «No se pudo obtener el relieve. Puedes seguir sin el visor 3D.» con el resto de la pantalla intacto.
  - Respuesta mal formada (`values` con 3 elementos de menos): 502 `invalid_relief_response`, «La respuesta del servidor no es válida. Inténtalo de nuevo.» Fallo de red: «No se pudo conectar con el servidor…».
  - Perímetro nulo: el lienzo se pinta sin perímetro y aparece «No hay parcela dentro de la vista: no se pueden calcular las lecturas.» (sin lecturas de parcela, solo vista y relieve).
  - Celdas sin dato (36 de 675 en un bloque): terreno continuo, «Hay celdas sin dato: se han estimado a partir de las vecinas.»
  - Parcela enorme: «Parcela mayor que la ventana: se muestra centrada en su centroide.» y «El borde se corta en el límite de la vista.», vista 200 × 200 m, 290.425 m² del servidor.
- **Atajos de ejemplo:** en el proyecto real solo sale «La de la ficha» (deshabilitado, sin referencia en la ficha); no salen «Parcela rústica/residencial (simulada)». En `PRY-EJ-001` salen los tres y al pulsar «Ver relieve» (también con otro Recorte) se pinta el terreno sintético («Fuente: Relieve simulado.») con **0 peticiones** a `/api/cadastre` (`13-*`).
- **WebGL:** al salir de la vista (enlace «Plan y tiempos») el contexto queda perdido (`isContextLost()` verdadero); al volver y volver a consultar se crea uno nuevo, y al cambiar Recorte el anterior se libera (siempre solo el último vivo). También se libera si se sale con una petición lenta en vuelo (5 contextos perdidos, ninguno vivo, sin errores de consola).
- **Servidor:** 24 llamadas simuladas al WCS y 16 al WFS para 95 peticiones a `/relief`: la caché por estudio funciona (19 filas en `relief_cache`, 4 referencias). La auditoría solo tiene los 2 eventos de crear las oportunidades (la consulta de relieve no audita ni cambia estado).

## Intentar romper

- **Doble clic:** doble clic en «Ver relieve» → 2 peticiones idénticas (la segunda sustituye a la primera, el resultado se pinta una vez). 8 cambios dobles rápidos de Recorte + Lado → 16 peticiones, queda la última (`margin=50&max_side=500`, controles y vista coherentes). No hay debounce (hallazgo 6).
- **Desmontar durante la petición:** sin errores ni avisos de React; WebGL liberado.
- **Teclado y foco:** orden de tabulación coherente (referencia → «Ver relieve» → Recorte → Lado → Exageración → lienzo → Restablecer/Acercar/Alejar); Enter en la referencia consulta; el lienzo tiene foco visible (outline 2 px, `16-focus-canvas-light.png`); tras un 404 el foco se queda en la referencia con `aria-describedby` al aviso. Las flechas desplazan la vista y Ctrl+flecha la gira (hallazgo 9).
- **Lector de pantalla (árbol de accesibilidad):** `textbox`/`combobox` con nombre, `image` «Relieve 3D del terreno de <referencia>», botones «Restablecer vista», «Acercar», «Alejar»; los avisos de error son `role=alert` dentro de la región `aria-live=polite`; «Cargando relieve…» se anuncia por esa región.
- **axe** (wcag2a/aa, wcag21aa y buenas prácticas, con `color-contrast`), claro y oscuro, en 8 estados cada uno (inicial, cargado, sin dato, parcela enorme, perímetro nulo, 404, 503 del relieve, referencia de 14): **0 violaciones**. También a 320 px.
- **320 px (`17-*`):** `scrollWidth` 539 con viewport 320. Es del shell: la barra lateral de 232 px deja la columna principal en ~88 px; dentro de ella el panel del visor desborda (referencia `min-w-[260px]`, selects), como en RGB-51 (hallazgo 7 de allí). La plataforma es de escritorio; sin cambio por RGB-52.
- **Rendimiento con 100 × 100 celdas (`15-*`):** respuesta de 69.562 bytes (10.000 valores); de pulsar a lienzo pintado ≈ 1 s con el WCS simulado; sin bloqueos del hilo principal (latencia del bucle de eventos 0,2 ms tras cambiar la exageración); heap JS 37 MB. Con WebGL por software la animación va a ~5 fps frente a ~9 fps con la fixture de 25 × 27 (en un equipo con GPU no es un problema; la malla del visor es siempre de 90 × 90 divisiones, así que el coste de dibujo apenas depende de la rejilla).

## Hallazgos

1. **Media/Baja. Escala de ~3 % entre el visor y el terreno real.** El visor proyecta lon/lat linealmente sobre `[0, width_m] × [0, height_m]`, pero `width_m`/`height_m` son los lados «nominales» de la ventana en UTM (125,0 × 131,18 m) y la rejilla cubre la caja en grados, que mide ≈ 128,9 × 135,0 m (el rectángulo UTM está girado ≈1,9° por la convergencia de meridianos en esa zona). Resultado: el perímetro coincide con la malla (ambos están en fracciones de la misma caja, sin desplazamientos), pero las dimensiones mostradas («Vista 125 × 131 m»), la pendiente media (sobreestimada ≈3 %) y el polígono dibujado (área en metros del visor 2730 m² frente a los 2906 m² del servidor: 94 %) están a escala algo menor. Repro: `GET /api/cadastre/4714805BC6841S0001AB/relief?margin=25&max_side=300`, comparar `(max_lon-min_lon)·111320·cos(lat)` con `width_m` y calcular el área del `outline` con los factores del visor. Sugerencia: que el servidor devuelva también el tamaño en metros de la caja en grados, o que el visor use `(max_lon-min_lon)·k` y `(max_lat-min_lat)·k` con una escala local.
2. **Baja. Tras un error al volver a consultar se queda el terreno anterior con los controles ya cambiados.** Con un relieve pintado, cambiar Recorte a 100 y recibir un 503 deja el lienzo y las lecturas de la ventana anterior (125 × 131 m) con el selector en «Parcela + 100 m» y el aviso de error (`14-*`). Lo mismo con 404/422. El aviso lo explica, pero el terreno visible no corresponde a los controles. Sugerencia: quitar el relieve al fallar o marcarlo como «anterior».
3. **Baja. «Parcela mayor que la ventana» cuando solo el margen excede el lado.** Con la fixture, Recorte «Parcela + 25 m» y Lado 100 m, el servidor responde `clipped: true, parcel_clipped: false` y el visor muestra «Parcela mayor que la ventana: se muestra centrada en su centroide.» aunque la parcela cabe entera (`18-*`). Es la equivalencia del plan (`clamped = clipped`); el texto es impreciso en ese caso.
4. **Baja. El 503 `cadastre_unavailable` dice «Introduce los datos a mano.»** (mensaje del servidor, pensado para la pantalla de datos técnicos) dentro del visor 3D, que no tiene ruta manual (`06-*`).
5. **Baja (heredado). La validación local dice «debe tener 20 caracteres» también para símbolos y para las 14 posiciones**, donde el servidor/RGB-18 da mensajes más precisos («Has escrito 14 caracteres: es la referencia de la parcela…»). Nunca llega al servidor, por lo que no se ven (`02-*`, `03-*`).
6. **Info. Sin debounce ni bloqueo durante la carga.** Cada cambio de Recorte/Lado y cada doble clic en «Ver relieve» lanza una petición; las obsoletas se descartan bien y el servidor las atiende de caché tras la primera, así que no hay efecto visible.
7. **Info. Desfase de media celda.** El visor coloca las celdas de borde a borde (columna `c` en `c/(n-1)`), mientras que el WCS entrega valores en el centro de celda (`(c+0,5)/n`): hasta 2,5 m de desplazamiento horizontal del terreno respecto al perímetro (0,55 m de altura como máximo bajo el perímetro de la fixture). No es visible.
8. **Info. Sin anuncio al terminar la carga.** «Cargando relieve…» se anuncia y desaparece; el éxito no se anuncia (la región queda vacía), y las lecturas no son región viva. Una persona con lector de pantalla no sabe que el terreno ya está.
9. **Info, heredado de RGB-34.** El texto dice «Usa las flechas para girar» y las flechas desplazan la vista (OrbitControls por defecto); gira Ctrl+flecha. El encuadre inicial recorta el borde inferior de la malla (igual que en `RGB-34/screenshots/rural-clipped-light.png`).
10. **Info. «Sup. del polígono» en la parcela enorme: 290.425 m²** (el del servidor para la parcela entera, no la parte visible), coherente con el plan (`plot_area_m2` de la parcela entera).

## No verificado

`AUTH_MODE=supabase` (se usó el modo de desarrollo; la ruta de relieve usa la misma autenticación que el resto de `/api/cadastre`, ya cubierta por RGB-25/26). Servicios reales del Catastro/INSPIRE/IDEE (a propósito). Lector de pantalla real. WebGL con GPU.

## Limpieza

Parados uvicorn (8000) y `next start` (3052); el servidor de desarrollo preexistente del puerto 3000 no se tocó. Base `rgb52` eliminada. Los scripts quedaron fuera del repo (scratchpad).
