# RGB-34 · Registro de implementación

## Escritor de tests

Estado: rojo. Ningún código de producción escrito.

### Archivos
- `__tests__/helpers/relieve-plano.ts`: relieve sintético (plano inclinado `h = 100 + 0,1·x`, ventana 100 × 100 m, rejilla 101 × 101, perímetro cuadrado 20–80, superficie 123456). Solo importa tipos de `@/lib/relieve`.
- `__tests__/lib/relieve-lecturas.test.ts`: `areaPoligono`, `puntoEnPoligono` (incl. cóncavo), `alturaEn` (esquinas, centro, puntos medios, rejilla 3 × 3, fila 0 = norte, sujeción al borde), `calcularLecturas` (pendiente ≈ 10 %, mín/máx, desnivel, superficie, plano horizontal, `null`, solo dentro del perímetro).
- `__tests__/lib/relieve.test.ts`: constantes, `recortarPoligono`, `calcularVentana` (margen, lado máximo, centroide por media de vértices, dimensión por dimensión, `recortada` solo si se limitó, margen 0), `obtenerRelieve` (referencias inválidas, coherencia de la rejilla, determinismo, criterio RGB-33 de la rústica 200 m / 25 m, coherencia de `recortada` y `parcelaCortada` en las 20 combinaciones para ambas referencias, copias).
- `__tests__/components/proyecto/relieve/VisorRelieve.test.tsx`: estado inicial, opciones, atajos, validación, carga, montaje, lecturas, avisos, cambio de Recorte / Lado / Exageración, botones, liberación (desmontaje, reemplazo, desmontaje durante la consulta), sin WebGL, error de consulta, etiquetas y axe (inicial, con relieve, sin WebGL). `@/lib/relieve-escena` mockeado con escena falsa.
- `__tests__/app/proyectos.test.tsx`: nuevo `describe` al final (fase 3 en todos los modos, ausencia en las demás fases, orden bajo el entregable, un solo h1, axe). No se tocó ningún test existente.
- `__tests__/lib/relieve-arquitectura.test.ts`: `three` solo en `lib/relieve-escena.ts`; `VisorRelieve` usa `import()` dinámico; nadie importa la escena de forma estática; `app/` no la referencia.

### Cómo fallan
- `relieve.test.ts`, `relieve-lecturas.test.ts`, `VisorRelieve.test.tsx`: la suite no arranca por módulos inexistentes (`@/lib/relieve`, `@/lib/relieve-lecturas`, `@/lib/relieve-escena`, `VisorRelieve`).
- `relieve-arquitectura.test.ts`: fallan 2 (no existen `lib/relieve-escena.ts` ni `VisorRelieve.tsx`); pasan las comprobaciones negativas, que se vuelven reales al existir los archivos.
- `proyectos.test.tsx`: fallan 5 del bloque nuevo (falta el panel); pasan los de ausencia en otras fases y los axe de fase 3 (ya pasaban sin panel; deben seguir pasando con él).
- Resto de la suite en verde (687 tests). `tsc` solo da errores por módulos inexistentes.

### Tests existentes modificados
Ninguno (solo se añade un `describe`).

### Ambigüedades y qué se comprueba
- Carga automática con referencia inicial válida: el plan no lo fija (el borrador sí). Los tests no la suponen: usan `referenciaInicial=""` y escriben la referencia; con la inicial solo se comprueba el valor del campo.
- Formato de las lecturas (decimales, separador de miles, estructura dl/dt o span/b): se extraen los números del texto y se comparan con `calcularLecturas` (tolerancia de 0,5) y con las unidades `m²`, `%`, `×N`.
- Nombres de los atajos «Probar con»: no están fijados; se buscan por /ficha/i, /rústica/i, /residencial/i. No se exige que el atajo consulte.
- Texto del error de `obtener` o de referencia inválida: el de referencia inválida es exacto; el de error de consulta solo debe aparecer en una región `aria-live`/`alert`/`status`.
- Colores de `montarEscena`: solo se exige `{ fondo, acento, borde }` con cadenas (en jsdom los tokens salen vacíos).
- `ControlesRelieve`, `LecturasRelieve`, `AvisosRelieve`: el plan no fija sus props; no se testean directamente, quedan cubiertos por `VisorRelieve`.
- `lib/relieve-escena.ts` no se testea con three (sin WebGL en jsdom); la liberación de WebGL se verifica con la escena falsa y la real queda para el Tester en navegador.
- `proyectos.test.tsx` no mockea la escena: si el Desarrollador consulta automáticamente al renderizar la página, jsdom lanzaría «sin WebGL», que el componente debe tolerar.

## Desarrollador

Estado: implementado. `npm run lint`, `typecheck` y `build` en verde; `npm test`: 789 de 790 (ver «Test que no se puede cumplir»). three **0.186.1** y `@types/three` **0.186.0**, ambas versiones exactas (sin `^`) en `package.json` y `package-lock.json`.

### Qué se hizo
- `lib/relieve.ts`: tipos, constantes, `recortarPoligono` (Sutherland–Hodgman, devuelve copias, la coordenada del borde se fija exacta), `calcularVentana` (media de vértices, dimensión por dimensión) y `obtenerRelieve`. La capa de ejemplo (todo hasta `obtenerRelieve`) está marcada en un bloque como sustituible por el cliente de la API (RGB-33). Relieve sintético determinista por referencia (`aleatorio` FNV-1a); la parcela se escala a un área objetivo (rústica `^\d{5}A`: 8-10 ha; residencial: 400-1200 m²), lo que garantiza el criterio RGB-33 (ventana 200 × 200 y `recortada` con lado 200). Rejilla de paso 5 m que cubre exactamente la ventana, fila 0 = norte.
- `lib/relieve-lecturas.ts`: `alturaEn`, `areaPoligono`, `puntoEnPoligono`, `calcularLecturas` (61 × 61, gradiente de paso 2 m).
- `lib/relieve-colores.ts` (nuevo, puro, con test): lee `fondo/acento/borde` y la rampa de alturas de los tokens CSS con `getComputedStyle`.
- `lib/relieve-escena.ts`: único módulo que importa `three` (+ `OrbitControls`). Escena del borrador con malla coloreada por altura, parcela translúcida, borde que sigue el terreno, borde del recorte, luces, `listenToKeyEvents(contenedor)`. `Error` si no hay WebGL (el renderer se crea primero y, si algo falla después, se libera). `liberar()` idempotente: RAF, ResizeObserver, `stopListenToKeyEvents` + `controls.dispose()`, dispose de geometrías y materiales recorriendo la escena, `renderer.dispose()`, `forceContextLoss()`, quita el canvas. `actualizarExageracion` reconstruye la geometría liberando la anterior (no consulta).
- `components/proyecto/relieve/{VisorRelieve,ControlesRelieve,LecturasRelieve,AvisosRelieve}.tsx`. Solo `VisorRelieve` es Client Component. Lecturas con `dl/dt/dd`; avisos con `Notice`; lienzo `role="img"` + `aria-label` + `tabIndex=0` + ayuda de teclado; botones Restablecer/Acercar/Alejar con `aria-label` fuera del contenedor del lienzo (superpuestos); `aria-live="polite"` para carga, error, sin WebGL y validación.
- Integración en `app/proyectos/[codigo]/fase/[fase]/page.tsx` (fase 3, todos los modos) con `referenciaInicial` de la ficha.
- `app/globals.css`: 4 tokens `--relieve-bajo|medio-bajo|medio-alto|alto` en claro y oscuro (los tres bloques idénticos donde el test de contraste lo exige). `tokens.test.ts` rechaza literales hex también en `lib/`, así que la rampa se deriva de tokens y no de constantes. Las luces usan valores numéricos neutros (blanco/gris), no colores de interfaz.
- Tests nuevos: `__tests__/lib/relieve-colores.test.ts` y `__tests__/lib/relieve-escena.test.ts` (escena real con renderer y controles falsos: montaje, sin WebGL, `liberar()` una sola vez y completo, reconstrucción al cambiar la exageración).
- Configuración de pruebas: `jest.config.js` (`transformIgnorePatterns` para transformar `three`, publicado como ESM) y `jest.setup.ts` (polyfill de `structuredClone`, que jsdom no expone y que usa un test del Escritor).

### Decisiones
- Los atajos «Probar con» solo rellenan el campo; no consultan (el plan no lo exige y evita consultas no pedidas). El de la ficha queda deshabilitado si la ficha no tiene referencia.
- No hay carga automática con la referencia inicial: se pulsa «Ver relieve».
- Cambiar Recorte o Lado con un relieve mostrado consulta la referencia del relieve mostrado (no el texto a medio editar del campo).
- Una consulta cancelada o posterior al desmontaje se descarta con un contador de solicitud; la escena se monta en un efecto con indicador `cancelado` y su cleanup la libera antes de montar la siguiente. Si la importación dinámica falla por otro motivo distinto de WebGL, también se muestra el mensaje de «sin WebGL».
- Residencial simulada: `9876543DF3897N0001XY` (ficticia).

### Test que no se puede cumplir (no modificado)
`__tests__/lib/relieve.test.ts` › «margen 0 m ensancha la caja por los cuatro lados»: espera `[-0, -0, 40, 30]` (usa `-m` con `m = 0`) y `toEqual` distingue `-0` de `0`. El test siguiente («margen 0: exactamente la caja de la parcela») espera `[0, 0, 40, 30]` con la misma parcela y margen, y pasa. Ambos son incompatibles para cualquier implementación; el fallo es del test (`-m`), no de `calcularVentana`. Propuesta: `expect(ventana).toEqual([0 - m, 0 - m, ...])`.

### Bundle de three
En `npm run build`, `three` (y `OrbitControls`) queda en un único chunk de 569 KB (`.next/static/chunks/0tbjuc5vkmhfa.js`) que solo referencia el chunk del `VisorRelieve` mediante `import()`; no aparece en el chunk de la página ni en el manifiesto de cliente de la ruta.

### Pendiente para el Tester
Comprobación en navegador real con WebGL: liberación al desmontar/reemplazar (`WEBGL_lose_context`), teclado con flechas, pantallazos claro/oscuro, rampa de colores en el tema oscuro.

## Refactor a inglés

**Alcance.** Regla nueva de `CLAUDE.md`: el código va en inglés. Se ha pasado todo el front (`app/`, `components/`, `lib/`, `__tests__/`, `jest.*`) sin cambiar comportamiento: archivos y directorios (con `git mv`), módulos, tipos, funciones, props, campos, valores internos (modos, estados, semáforo, motivos, ids de datos técnicos, ids del DOM), tokens CSS `--relieve-*` (ahora `--relief-*`), comentarios, JSDoc, nombres de `describe`/`it`/`test` y datos de prueba. No se toca `backend/`, `scripts/` ni migraciones. Tabla antiguo a nuevo en [`docs/front-rename-english.md`](../../front-rename-english.md); el contrato de este plan usa ya los nombres nuevos.

**Cifras.**

| | Antes | Después |
|---|---|---|
| `npm test` | 790 tests (789 verdes y 1 rojo: el del `-0`) en 42 suites | 790 tests, 790 verdes, 42 suites |
| `npm run build` | 10 rutas | las mismas 10 rutas (solo cambian los nombres internos `[code]` y `[phase]`) |
| `npm run lint` / `typecheck` | verde | verde |

**Decisiones.**
- Valores con texto visible que se mostraban tal cual: `PhaseTimeline` pinta ahora «hecha»/«actual»/«vista» desde un mapa (`STATE_TEXT`), porque el estado interno es `done|current|upcoming`. Igual con `Capacity.limitedBy` (`buildability|occupancy-floors`) en `CapacityPanel` (`LIMIT_LABEL`) y con el motivo de pausa y el semáforo (ya tenían mapa de etiquetas).
- `Ventana` se llama `ViewWindow` y el campo `viewWindow` (no `window`, para no sombrear el global del navegador); `Escena` es `ReliefScene` (para no chocar con `Scene` de three); `Grupo` es `DataGroup` (para no chocar con `Group` de three); `contenedor` es `host` (para no chocar con `container` de Testing Library).
- Parámetros dinámicos internos renombrados: `[codigo]` a `[code]` y `[fase]` a `[phase]`; las URLs no cambian.
- Datos de prueba traducidos (`CL PRUEBA 1`, `Ejemplo uno`, etc.) solo cuando no son texto de usuario; los textos que los tests comprueban en la interfaz siguen en español.

**Excepción autorizada en un test.** `__tests__/lib/relief.test.ts` (antes `relieve.test.ts`), «margin %i m widens the box on all four sides»: `[-m, -m, 40 + m, 30 + m]` pasa a `[0 - m, 0 - m, 40 + m, 30 + m]` porque con `m = 0` el primero produce `-0` y `toEqual` distingue `-0` de `0`. Es el fallo que ya se documentó más arriba; con este cambio los 790 tests pasan. No se cambió ninguna otra aserción.

**Se conserva en español (a propósito).**
- Textos de interfaz, `aria-label`, mensajes de error, etiquetas y avisos; nombres y entregables de las fases del PRD (`lib/phases.ts`); nombres de proyectos de ejemplo («… (ejemplo)»); códigos `PRY-EJ-00N`; referencias catastrales de ejemplo; opciones y orígenes de los datos técnicos (Catastro, CTE…).
- **URLs de las páginas** (decisión a confirmar): `app/proyectos`, `app/cartera`, `app/por-promover`, `app/reporte-semanal`, `app/ajustes`, `fase`, `plan-y-tiempos`, y el ancla `#contenido` del enlace «Saltar al contenido» (se ve en la barra de direcciones). Si se quieren en inglés, es un cambio aparte porque afecta a enlaces, tests y marcadores.
- Palabras que existen igual en inglés (`plan`, `area`, `base`, `error`, `control`, `color`, `info`).

**Comprobación.** Se buscó con un recorrido del AST que no quedan identificadores en español (fase, proyecto, entregable, tiempo, pausa, relieve, consumo, datos, capacidad, referencia, ventana, etc.) fuera de cadenas de usuario; los comentarios y títulos de tests se revisaron con una búsqueda de palabras españolas.

## Tester

Fecha: 2026-10-24. Navegador real: Chromium (Playwright, `playwright-core` en el directorio temporal de la sesión, fuera del repo) con WebGL por software (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`), locale `es-ES`, 1440 px, claro y oscuro, build de producción en un puerto libre (los procesos se mataron al terminar).

### Qué se ejecutó
- `npm run lint`, `typecheck`, `test` (42 suites, 790 tests) y `build` en verde. `test` tarda 40-41 s (dos pasadas completas antes de tocar nada y una tercera tras el cambio, sin ningún test inestable). `build`: las mismas 10 rutas.
- `three` queda en un solo chunk diferido (`static/chunks/3fl1g5p746oap.js`, 569 KB, único que contiene `WebGLRenderer`/`forceContextLoss`). Ningún `page_client-reference-manifest` de las 11 rutas lo lista; el HTML de la fase 3 no lo referencia; en el navegador no se pide al cargar la página y se pide una sola vez al pulsar «Ver relieve». Solo lo referencia el chunk del `ReliefViewer` (`import()`). Existe además una copia del módulo para SSR en `.next/server/chunks/ssr/` (compilación del `import()` en servidor): no se ejecuta en el render (los efectos no corren en servidor).
- Rutas y regresión (build real): `/proyectos`, `/cartera`, `/por-promover`, `/reporte-semanal`, `/ajustes` 200; `/` redirige a `/cartera`; `/proyectos/PRY-EJ-00{1..4}` redirige a su fase actual (3, 0, 6, 2); fases 0..7 de las cuatro: 200 y un único h1; «hecha/actual/vista» correctos; el panel «Datos técnicos del inmueble» solo en la fase 2 y «Relieve 3D del terreno» solo en la fase 3; `/plan-y-tiempos` 200 (EJ-002 sin tablas: «Sin plan hasta promover»); 404 en `NOEXISTE`, `/fase/8`, `/fase/x` y `/nada`. Fase 2 (EJ-004): consulta, 56 etiquetas, «Editado» con «Valor de Catastro: 142», «Restaurar», «Todo verificado», capacidad. Plan y tiempos de EJ-001: resumen (11 / 64 sem, 4 sem en pausa, +1 sem), tabla por fase e historial. Fase 1 en solo lectura (`readOnly`, sin cambios).
- Revisión de nombres: sin identificadores, comentarios ni títulos de tests en español fuera de cadenas de interfaz, nombres de fases, `PRY-EJ-00N` y las URLs (`proyectos`, `fase`, `plan-y-tiempos`, ya documentadas como excepción). Se escaparon `atajos` (prop de `ReliefControls` y constante de `ReliefViewer`, la tabla decía `shortcuts`) y `centroX`/`centroY` de `lib/relief-scene.ts`: corregidos (ver «Cambios del Tester»).

### Visor en el navegador
- Referencia de la ficha (`1234567DG3413S0001AB`): el lienzo renderiza (1858 colores distintos en el lienzo, no vacío), Superficie 503 m², altitud 170,4–173,3 m, desnivel 2,9 m, pendiente 12,1 %, Vista 73 × 78 m, solo «Orientativo… Fuente: Relieve simulado». Residencial (`9876543DF3897N0001XY`): 1025 m², 228,1–231,7 m, 3,6 m, 9,4 %, 90 × 87 m, sin avisos de recorte. Rústica (`08187A005001230000OK`): 87.002 m², 314,6–349,9 m, 35,2 m, 13,2 %, Vista 200 × 200 m, avisos «Parcela mayor que la ventana…» y «El borde se corta…».
- Lado máximo en la rústica: 100 → 100 × 100 con ambos avisos; 300 → 300 × 300 con ambos; 500 → 388 × 405 sin avisos; 200 → 200 × 200 con ambos. Recorte 0/10/25/50/100 con lado 200: sigue 200 × 200 (la ventana está limitada). Cada cambio vuelve a consultar y redibuja (1 contexto nuevo por cambio).
- Exageración ×1/×2/×3: la escena cambia (el hash del lienzo cambia), la lectura «Relieve» pasa a ×N, no aparece «Cargando…» y no se crea ningún contexto nuevo (14 antes, 14 después): no consulta.
- Controles antes de mostrar nada: no hay lienzo ni error; al pulsar «Ver relieve» se usan los valores elegidos (300 m, ×3).
- Botones: «Acercar», «Alejar» y «Restablecer vista» cambian la vista; «Restablecer» deja exactamente el encuadre inicial (la diferencia de hash con el primer cuadro es solo el anillo de foco del botón). Rotación con ratón (arrastrar), rueda y flechas (←, →, ↑, ↓ con el lienzo enfocado): todas cambian la escena.
- Referencia inválida: 19, 21 (quitando `maxlength` desde la consola), con `!`, vacía y con espacio interior: aviso «La referencia catastral debe tener 20 caracteres.», `aria-describedby` apuntando al aviso, 0 contextos nuevos (no se consulta). El aviso desaparece al enviar una válida. Minúsculas (`08187a…ok`): mismas lecturas que en mayúsculas y `aria-label` en mayúsculas. Un pegado de 20 caracteres con espacio inicial se rechaza (el espacio cuenta para el `maxLength`): baja.
- Casos borde: 6 referencias distintas pulsadas sin esperar: gana la última (aria-label y 1 sola escena viva); 12 clics síncronos en «Ver relieve»: 1 escena; cambiar Lado máximo 10 veces seguidas: 1 escena viva; redimensionar la ventana 1440 → 1000 → 700 → 1440: el lienzo sigue al contenedor (672/372/1112 px de ancho, sin barra horizontal, sin quedar vacío); cambiar de pestaña y volver: sin errores. Un sondeo con otra pestaña al frente no cambia `visibilityState` en Chromium headless (no probado de verdad).

### Liberación de WebGL (criterio clave)
Se parchea `HTMLCanvasElement.prototype.getContext` antes de cargar la página: se guarda cada contexto WebGL creado, se escucha `webglcontextlost` y se consulta `gl.isContextLost()` y `canvas.isConnected`.

| Situación | Creados | Vivos | Canvas en el DOM |
|---|---|---|---|
| Tras «Ver relieve» | 1 | 1 | 1 |
| 5 ciclos «ver relieve → enlace a Cartera → Proyectos → proyecto» (y «Ver relieve» repetido en cada vuelta) | 6 | 1 en pantalla; **0 al salir** en los 5 | 0 al salir |
| 5 veces «pulsar Ver relieve e ir a Cartera en el acto» | 11 | 0 al salir | 0 |
| Atrás / Adelante del historial | 12 | 0 al salir | 0 |
| Reemplazo: 3 referencias seguidas + 10 cambios de Lado máximo | 25 en total | **1** | 1 |

Máximo de contextos vivos simultáneos en toda la sesión: **1** (el límite de Chromium es 16 y se crearon 25 sin ningún aviso «Too many active WebGL contexts»; la consola no tuvo errores ni avisos). Al final, 24 eventos `webglcontextlost` por 25 creados (el último sigue vivo). Desmontaje con la importación dinámica en curso (el chunk de `three` retrasado 2,5 s con `page.route`): al llegar el chunk tras salir de la página, 0 contextos creados y 0 canvas; volver y pulsar crea 1 normal. Dos consultas con la importación pendiente: 1 contexto creado y la escena es la de la última. Con `next dev` (React StrictMode, doble efecto) 4 ciclos: máximo 1 vivo, 0 al salir.

### Sin WebGL
Con `getContext('webgl'|'webgl2')` devolviendo `null` (script de inicio), claro y oscuro: aviso «Este navegador no puede mostrar el modelo 3D (WebGL no disponible).», sin lienzo, la página sigue entera (h1, entregable, controles). Las lecturas y el aviso «Orientativo» se siguen mostrando; Recorte, Lado y Exageración funcionan (la lectura pasa a ×3, 300 × 300…), la validación de la referencia sigue avisando y se puede reintentar. Three escribe en consola «THREE.WebGLRenderer: Error creating WebGL context.» (ruido de la librería, esperado).

### Accesibilidad y contraste
- axe-core real (wcag2a/aa, 21aa, best-practice): 0 violaciones en estado inicial, con relieve y sin WebGL, en claro y en oscuro.
- Una `label` por control; foco visible: outline sólido de 2 px con offset 2 px en `--focus` (11,3:1 sobre `surface` en claro, 5,6:1 en oscuro) tanto en los botones como en el contenedor del lienzo (`role="img"`, `aria-label`, `tabIndex=0`); lecturas y avisos en el DOM.
- Contraste con los tokens. Texto: `muted` sobre `surface` (ayuda y «↑ N») 5,59 claro / 6,92 oscuro; `muted` sobre `surface-2` (etiquetas de lecturas) 4,64 / 5,94; `ink` sobre `surface-2` 14,0 / 11,8; `warn` sobre `warn-soft` 4,77 / 6,83. No textual: línea de acento de la parcela sobre el fondo 9,39 / 4,81. Por debajo de 3:1 (ver hallazgos 3 y 4): borde del recorte (`--line` sobre `surface-2`) 1,98 / 1,93; extremos de la rampa `--relief-*` contra el fondo (1,09 en el tono más alto en claro; 2,22 en el más bajo en oscuro), y el relleno de la parcela (acento al 45 %) contra los tonos de la rampa (1,03-2,3). El borde de los controles (`--hair`) está en 1,47 / 1,35 sobre `surface`: patrón heredado de la app.

### Criterios

| Criterio | Resultado | Evidencia |
|---|---|---|
| Libera WebGL al salir y al reemplazar | Cumple | tabla anterior: máx. 1 vivo, 0 al salir, 0 canvas huérfanos, sin avisos de contextos |
| Mensaje sin WebGL | Cumple | mensaje exacto, página intacta, controles operativos |
| Recorte, lado máximo, exageración; rústica centrada y recortada | Cumple | 200 × 200 con ambos avisos; exageración sin consulta |
| Lecturas y avisos | Cumple | valores coherentes en el DOM; avisos solo en la rústica con lado ≤ 300 |
| Referencia inválida | Cumple | aviso, 0 consultas |
| Accesible con teclado, DOM, español, tokens | Cumple (con hallazgos de contraste visual, 3 y 4) | axe 0, foco 2 px, flechas |
| lint, typecheck, test, build; three solo en su chunk | Cumple | ver arriba |
| Pantallazos | Cumple | ver abajo |

### Hallazgos
1. **Media, sin corregir.** El relleno translúcido de la parcela se triangula solo con los vértices del perímetro (como el borrador) y queda plano frente al terreno: el terreno asoma por «agujeros» dentro de la parcela (visible en `residential-light.png`, y en la rústica casi toda la ventana se ve moteada). Propuesta: remuestrear el relleno sobre la rejilla de la malla recortada al polígono, o subdividir los triángulos.
2. **Baja.** El encuadre inicial en un contenedor ancho y bajo (1114 × 460) recorta el borde sur de la malla (la esquina más cercana sale del lienzo); con «−» o la rueda se ve entera. Mismo encuadre que el borrador, que usa 500 px de alto.
3. **Baja (visual).** En claro, los tonos altos de la rampa (`--relief-mid-high` 1,50:1 y `--relief-high` 1,09:1 frente al fondo `surface-2`) se funden con el fondo en las zonas más iluminadas del borde; lo mitiga el sombreado de la luz. En oscuro, el relleno de acento al 45 % sobre los tonos medios y altos de la rampa se distingue poco del terreno (1,03-1,12); la parcela se reconoce por el tono rosado y la línea de acento (4,81:1 sobre el fondo, pero contra el terreno menos).
4. **Baja.** El borde del recorte (`--line`) no llega a 3:1 contra el fondo (1,98 claro / 1,93 oscuro); es un trazo de apoyo y la ventana también la dan «Vista» y los avisos en texto.
5. **Baja.** Si el navegador pierde el contexto WebGL (`webglcontextlost` por la GPU), el lienzo se queda en blanco sin mensaje ni restauración. No lo exige el plan.
6. **Baja.** Un pegado de la referencia con un espacio inicial se corta a 20 caracteres con el espacio y da «debe tener 20 caracteres». Quitar `maxLength` y recortar al validar lo resolvería (el contrato ya recorta).
7. **Info.** El campo de referencia no marca `aria-invalid` (usa `aria-describedby` al aviso; el aviso está en una región `aria-live`).

### Cambios del Tester
- Renombres que faltaban del refactor a inglés, sin cambio de comportamiento: `atajos` a `shortcuts` (`ReliefControls`, `ReliefViewer`) y `centroX`/`centroY` a `centerX`/`centerY` (`lib/relief-scene.ts`). Tras el cambio: lint, typecheck, test (790/790) y build en verde.
- Pantallazos nuevos. Ningún test añadido (no apareció ningún hueco que no cubra ya la suite).

### Pantallazos (`docs/plans/RGB-34/screenshots/`, 1440 px, build real, datos ficticios, claro `-light` y oscuro `-dark`)
`residential-*.png` (parcela residencial con relieve), `rural-clipped-*.png` (rústica 200 × 200 recortada con los dos avisos), `exaggeration-x3-*.png` (rústica ×3), `invalid-reference-*.png`, `no-webgl-*.png`, `focus-canvas-*.png` (foco de teclado en el lienzo tras girar con la flecha), `focus-control-*.png` (foco en un botón del visor).

Defectos visuales: hallazgos 1 (agujeros en el relleno), 2 (borde sur recortado por el lienzo) y 3 (poco contraste de la rampa y del relleno en el modo oscuro). Sin solapes, sin lecturas cortadas ni controles desbordados; la escena nunca queda vacía.

## Corrección tras el Tester

Estado: `lint`, `typecheck`, `test` (45 suites, 827 tests) y `build` en verde. Los pantallazos los regenera el Tester.

### Cambios
- **Hallazgo 1 (relleno con huecos).** Nuevo módulo puro `lib/relief-plot-fill.ts`: `subdivideTriangles` parte los triángulos del relleno (bisección por la arista más larga) hasta que ninguna arista supera el paso de la malla del terreno (`lado de la ventana / MESH_DIVISIONS`); la unión no cambia, así que el contorno es exacto, y cada vértice se eleva a la altura del terreno + 0,5 m. Además el material usa `polygonOffset` (factor/unidades -2) para evitar z-fighting. El borde de la parcela sigue dibujándose con la línea de acento.
- **Hallazgo 3 (contraste de la rampa y del relleno).** `app/globals.css`: rampa `--relief-*` nueva, más oscura en claro (`#4a5d45`, `#6f7d58`, `#8f8a5e`, `#a8895a`: 5,9 a 2,7:1 frente al fondo) y verdosa y más oscura en oscuro (`#35553f`…`#557b5b`: 1,7 a 2,9:1). El relleno sube de opacidad 0,45 a 0,6 (`PLOT_FILL_OPACITY`, compartida entre la escena y el test). Temas oscuro por sistema y por `data-theme` idénticos.
- **Hallazgo 4 (borde del recorte).** Token nuevo `--relief-clip` (claro `#6b6a66`, 4,5:1; oscuro `#8c8b87`, 4,1:1 frente a `surface-2`); `readSceneColors` lo lee en lugar de `--line`.
- **Hallazgos 6 y 7.** El valor se recorta (`trim`) antes de validar y se reescribe recortado en el campo; `maxLength` pasa de 20 a 40 para que un pegado con espacios no se trunque (la validación sigue exigiendo 20 caracteres tras recortar). El campo lleva `aria-invalid` (verdadero cuando hay error) junto con `aria-describedby`.

### Tests
- Nuevos: `__tests__/lib/relief-plot-fill.test.ts` (área conservada, aristas máximas, caja contenedora, entrada sin mutar, límite no positivo), `__tests__/lib/relief-contrast.test.ts` (borde del recorte y contorno >= 3:1; cada tono de la rampa >= 1,5:1 frente al fondo; relleno al 60 % >= 1,2:1 sobre cada tono, en claro, oscuro y oscuro por sistema), `__tests__/components/project/relief/ReliefViewerInput.test.tsx` (pegado con espacios y `aria-invalid`).
- Test existente modificado: `__tests__/lib/relief-colors.test.ts` fijaba `--line` como origen del borde; ahora fija `--relief-clip` (cambio de comportamiento justificado por el hallazgo 4). Ningún otro test del Escritor se tocó.

### Pendientes (fuera de esta corrección)
- Hallazgo 2: encuadre inicial en un lienzo ancho y bajo recorta el borde sur.
- Hallazgo 5: no hay manejo de `webglcontextlost`.
- El contraste del relleno sobre los tonos altos de la rampa en oscuro es modesto (>= 1,3:1 en luminancia; se distingue sobre todo por el tono rosado y la línea de acento).

### Reverificación del Tester tras `f3f92e9`

Fecha: 2026-10-24. Mismo método (build real, Chromium con WebGL por software, es-ES, 1440 px, claro y oscuro).

**Comandos.** `lint` y `typecheck` en verde; `test` 45 suites, 827 tests, dos pasadas (42,2 s y 41,0 s) sin inestables; `build` en verde. `three` sigue en un solo chunk diferido (`static/chunks/1m7xsumeumuc8.js`, el único con `WebGLRenderer`); ningún `page_client-reference-manifest` lo lista; no se pide al cargar la fase 3 y se pide una vez al pulsar «Ver relieve».

| Hallazgo | Estado | Evidencia |
|---|---|---|
| 1. Terreno asoma por el relleno | Resuelto | En residencial y rústica recortada (claro y oscuro) el relleno cubre la parcela sin huecos (`rural-fill-detail-*.png`, `residential-*.png`, `rural-clipped-*.png`); antes había manchas del terreno dentro de la parcela. |
| 3. Rampa y relleno poco contrastados | Parcial | Rampa contra el fondo `surface-2`: claro 5,93 / 3,67 / 2,92 / 2,73 (antes 3,55 a 1,09); oscuro 1,70 / 2,03 / 2,45 / 2,94 (antes 2,22 a 7,68, pero con el problema de relleno). La parcela ahora destaca en ambos temas a simple vista (tono rosado/pardo frente a verde y oliva). Siguen bajos los contrastes de luminancia relleno al 60 % contra rampa: claro 1,37-2,07; oscuro 1,31-1,88 (el relleno más claro que el terreno en oscuro). La línea de acento contra la rampa: claro 1,58-3,44; oscuro 1,63-2,83. Se distinguen por matiz, no por luminancia (ver hallazgo nuevo A). |
| 4. Borde del recorte | Resuelto | `--relief-clip` contra el fondo: 4,50 claro / 4,15 oscuro (antes 1,98 / 1,93); la línea gris se ve en ambas capturas de la residencial. Contra el terreno 1,2-2,4 (es una línea de apoyo, además de «Vista» en texto). |
| 6. Pegado con espacios | Resuelto | `maxLength` 40 y recorte al validar: `"  REF"`, `"REF   "`, `"  REF  "` y con tabulador/salto se aceptan, el campo queda recortado y se consulta; 20 caracteres con espacios y 2 de más (22 útiles) se rechazan con el aviso. |
| 7. `aria-invalid` | Resuelto | `false` al inicio; `true` con referencia inválida (y `aria-describedby` al aviso); vuelve a `false` tras un envío válido. Nota: sigue `true` mientras se corrige el texto hasta el siguiente envío (diseño actual, Info). |

**Liberación de WebGL con el relleno nuevo (cifras idénticas a la primera vuelta).** Máximo vivo simultáneo 1; 5 ciclos de navegación: 0 vivos y 0 canvas al salir en los 5 (creados 6); 5 veces «ver relieve y salir en el acto»: 0 vivos al salir (creados 11); Atrás/Adelante: 0; 3 reemplazos + 10 cambios de lado: 1 vivo, 25 creados, 24 eventos `webglcontextlost`; consola sin errores ni avisos. El relleno vive en el mismo grupo que se recorre con `traverse` al liberar y al cambiar la exageración, de modo que su geometría y su material se liberan con el resto (no se puede leer `renderer.info.memory` desde fuera del módulo; lo cubren los tests de `relief-scene` y la ausencia de contextos vivos).

**axe** (claro y oscuro): 0 violaciones en inicial, con relieve y sin WebGL. Foco de 2 px sin cambios.

**Pantallazos regenerados** (`docs/plans/RGB-34/screenshots/`, claro y oscuro): `residential`, `rural-clipped`, `exaggeration-x3`, `invalid-reference`, `no-webgl`, `focus-canvas`, `focus-control`, y nuevos `rural-fill-detail` (lienzo de la rústica recortada ×3, relleno sin huecos) y `aria-invalid` (campo inválido con el foco puesto).

**Hallazgos nuevos.**
- A. **Baja (visual).** Con opacidad 0,6 el relleno oculta casi por completo la rampa de alturas dentro de la parcela: en la rústica recortada (donde la parcela ocupa toda la ventana) el terreno se ve de un solo tono pardo (claro) o rosa pálido (oscuro) y el relieve se lee solo por el sombreado y las lecturas; en oscuro con ×3 el sombreado es muy tenue. Propuesta: bajar la opacidad (~0,35-0,45) o dibujar solo el contorno y un relleno más tenue cuando la parcela cubre la ventana.
- B. **Info.** Pendientes de antes: 2 (encuadre que recorta el borde sur) y 5 (pérdida de contexto WebGL sin aviso).

### Ajuste tras el Juez
- `PLOT_FILL_OPACITY` baja de 0,6 a 0,45 (el valor del borrador): con 0,6 el relleno tapaba la rampa y la parcela rústica, que llena la ventana, quedaba como una losa de un tono. `relief-plot-fill.test.ts` añade `toBeLessThanOrEqual(0.45)` para que no vuelva a subir. `relief-contrast.test.ts` no se tocó y sigue pasando (umbral 1,2:1 del relleno sobre cada tono de la rampa; mínimo con 0,45 = 1,22).
- `@types/three` pasa de `dependencies` a `devDependencies` (0.186.0 exacta). `package-lock.json` regenerado con `npm install --package-lock-only`: además del cambio esperado, npm añadió entradas opcionales de `@tailwindcss/oxide-wasm32-wasi` (ajenas a esta tarea; es la salida del propio npm).
