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
