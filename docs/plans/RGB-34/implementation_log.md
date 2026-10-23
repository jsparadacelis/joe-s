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
