# RGB-34 · Visor 3D del terreno con recorte, ventana máxima y exageración

Tarea de Notion: https://app.notion.com/p/3fd444f747b381b48bc8ebbe769ce94c
Tipo: Frontend · Épica E6 · P1 · Tamaño L
Depende de: RGB-33 (servicio de relieve, backend, sin hacer) y RGB-10 (hecha).

## Decisión sobre la dependencia

Como en RGB-10, RGB-22 y RGB-29: se construye contra un contrato propio (`lib/relieve.ts`) servido con datos de ejemplo ficticios y sintéticos (relieve simulado con semilla por referencia; no se copian los datos reales del borrador). Al existir RGB-33 se sustituye `obtenerRelieve` por el cliente de la API sin tocar el visor. Toda consulta al IGN/Catastro va por el servidor: el front nunca llama a servicios externos.

Reparto: **el servicio (RGB-33) decide la ventana** (caja de la parcela + margen, limitada al lado máximo y centrada en el centroide si la supera), pide el MDT solo de esa ventana y devuelve rejilla, límites, perímetro recortado y los indicadores `recortada` y `parcelaCortada`. **El front dibuja** y calcula las lecturas dentro de la parcela visible (superficie, altitud mínima y máxima, desnivel, pendiente media), como el borrador. En la capa de ejemplo la ventana se calcula con funciones puras marcadas como sustituibles.

Referencia visual y de código: el visor del borrador navegable (three.js + OrbitControls; `Relief.mount`, `synth`, `clipRect`, `shoelace`, `inPoly`, `.relief`, `.rl-stats`, `.rl-btns`, `.rl-note`).

## Objetivo

En la fase de Anteproyecto (fase 3), un visor 3D del terreno de cualquier referencia catastral, con recorte, lado máximo de la vista y exageración vertical, con lecturas de la parcela visible y avisos de recorte y de carácter orientativo.

## Alcance

- Panel «Relieve 3D del terreno» en `/proyectos/[codigo]/fase/3`, debajo del entregable genérico. El visor se puede usar en los tres modos de la fase (es consulta: no guarda nada), como en el borrador.
- Controles: campo «Referencia catastral» (20 caracteres, prellenado con la de la ficha vía `obtenerReferenciaCatastral`), botón «Ver relieve», «Recorte» (Solo la parcela / Parcela + 10 / 25 / 50 / 100 m; por defecto +25), «Lado máximo de la vista» (100 / 200 / 300 / 500 m; por defecto 200), «Exageración vertical» (×1 (real) / ×2 / ×3; por defecto ×2). Atajos «Probar con»: la de la ficha, una parcela rústica grande simulada (`08187A005001230000OK`) y una residencial simulada.
- Referencia inválida: aviso «La referencia catastral debe tener 20 caracteres.» y no se consulta. Sin referencia aún: mensaje «Escribe una referencia catastral de 20 caracteres y pulsa «Ver relieve».»
- Escena: malla coloreada por altura (verde grisáceo a arena), parcela resaltada (tono de acento, translúcido), borde de la parcela que sigue el terreno, borde del recorte, luz hemisférica y direccional, norte, botones «Restablecer», «+» y «−» (acercar / alejar), rotación y zoom con ratón, táctil y teclado (flechas).
- Lecturas dentro de la parcela visible (en el DOM, accesibles): Superficie del polígono, Altitud en la parcela (mín–máx), Desnivel, Pendiente media, Vista (ancho × alto en m) y Relieve (×N vertical).
- Avisos (en el DOM): «Parcela mayor que la ventana: se muestra centrada en su centroide.» si `recortada`; «El borde se corta en el límite de la vista.» si `parcelaCortada`; siempre «Orientativo: no sustituye un levantamiento topográfico.» y la fuente del dato.
- Cambiar Recorte o Lado máximo con un relieve mostrado vuelve a pedirlo al servicio y redibuja; cambiar Exageración solo reescala (no consulta).
- **Liberar recursos de WebGL** al desmontar y antes de montar otra escena: cancelar el `requestAnimationFrame`, `controls.dispose()`, `dispose()` de geometrías y materiales, `renderer.dispose()` y `renderer.forceContextLoss()`, desconectar el `ResizeObserver`.
- **Sin WebGL**: mensaje «Este navegador no puede mostrar el modelo 3D (WebGL no disponible).» sin romper la página.
- Carga diferida de `three`: la escena vive en un módulo importado dinámicamente desde el componente cliente (nada de three en el render de servidor ni en el bundle inicial).

Fuera de alcance: servicio real de relieve (RGB-33), cálculo de perímetro INSPIRE (RGB-25), persistencia, exportar, medir sobre la malla, autenticación.

## Contrato (`lib/relieve.ts`, datos de ejemplo sustituibles por RGB-33)

```ts
export type Margen = 0 | 10 | 25 | 50 | 100;
export type LadoMaximo = 100 | 200 | 300 | 500;
export type Exageracion = 1 | 2 | 3;
export type Punto = readonly [number, number];                 // metros en coordenadas locales (x este, y norte)
export interface OpcionesRelieve { referencia: string; margen: Margen; ladoMaximo: LadoMaximo }
export interface Relieve {
  referencia: string;
  ventana: readonly [number, number, number, number];         // [x0, y0, x1, y1] en m; la rejilla cubre exactamente la ventana
  columnas: number; filas: number;
  alturas: readonly number[];                                  // filas*columnas, fila 0 = norte (y máxima), orden de lectura
  perimetro: readonly Punto[];                                 // perímetro de la parcela recortado a la ventana
  superficiePoligono: number;                                  // m² del perímetro COMPLETO (sin recortar)
  recortada: boolean;                                          // la ventana se limitó al lado máximo
  parcelaCortada: boolean;                                     // el perímetro quedó cortado por la ventana
  fuente: string;                                              // p. ej. «Relieve simulado»
}
export function obtenerRelieve(opciones: OpcionesRelieve): Promise<Relieve>;     // rechaza con Error si la referencia no es válida
export const MARGENES: readonly Margen[]; export const LADOS_MAXIMOS: readonly LadoMaximo[]; export const EXAGERACIONES: readonly Exageracion[];

// Capa de ejemplo (sustituible por el servicio RGB-33); puras y probadas:
export function recortarPoligono(poligono: readonly Punto[], ventana: readonly [number, number, number, number]): Punto[];   // Sutherland–Hodgman como clipRect del borrador
export function calcularVentana(perimetro: readonly Punto[], margen: number, ladoMaximo: number): { ventana: [number, number, number, number]; recortada: boolean };
```

`calcularVentana`: caja de la parcela + margen; si el ancho supera `ladoMaximo`, se centra en el centroide (media de vértices) con ese ancho; ídem para el alto; `recortada` es verdadero si alguna dimensión se limitó. Criterio de RGB-33 que debe cumplir también la capa de ejemplo: una parcela rústica de unas 9 ha con lado 200 m devuelve una ventana de 200 × 200 m y `recortada` verdadero.

`lib/relieve-lecturas.ts` (puro):

```ts
export interface Lecturas { superficie: number; alturaMin: number; alturaMax: number; desnivel: number; pendienteMedia: number }  // pendiente en %
export function alturaEn(relieve: Pick<Relieve, 'ventana'|'columnas'|'filas'|'alturas'>, x: number, y: number): number;   // interpolación bilineal, fuera de la ventana se sujeta al borde
export function areaPoligono(poligono: readonly Punto[]): number;     // fórmula del área de Gauss (shoelace), siempre >= 0
export function puntoEnPoligono(poligono: readonly Punto[], x: number, y: number): boolean;
export function calcularLecturas(relieve: Relieve): Lecturas | null;  // null si no hay muestras dentro del perímetro
```
`calcularLecturas` como el borrador: malla de 61×61 puntos sobre la ventana (60 divisiones por eje); se conservan los que caen dentro del perímetro recortado; `alturaMin`/`alturaMax` de esas muestras; `desnivel = max − min`; pendiente media = media de `hypot(gx, gy)×100` con gradiente por diferencias centrales de paso 2 m; `superficie = superficiePoligono`.

## Componentes y módulos

- `lib/relieve-escena.ts` (único módulo que importa `three`): `montarEscena(contenedor: HTMLElement, relieve: Relieve, exageracion: Exageracion, colores: { fondo: string; acento: string; borde: string }): Escena` con `Escena { reiniciar(): void; acercar(): void; alejar(): void; actualizarExageracion(e: Exageracion): void; liberar(): void }`. Lanza `Error` si no hay WebGL. Los colores se leen de los tokens CSS (`getComputedStyle`), sin literales en los componentes.
- `components/proyecto/relieve/VisorRelieve.tsx` (Client Component): estado de controles, validación, consulta, ciclo de vida de la escena (importación dinámica de `@/lib/relieve-escena`, `liberar()` en el cleanup del efecto y antes de montar otra), lecturas, avisos y mensajes de error / sin WebGL. Props: `{ referenciaInicial: string; obtener?: typeof obtenerRelieve }` (inyectable en tests).
- `components/proyecto/relieve/{ControlesRelieve,LecturasRelieve,AvisosRelieve}.tsx`: piezas pequeñas y presentacionales.
- Integración en `app/proyectos/[codigo]/fase/[fase]/page.tsx` solo para la fase 3.

Accesibilidad: cada control con `label`; el contenedor del lienzo con `role="img"` y `aria-label` («Relieve 3D del terreno de {referencia}»), enfocable (`tabIndex=0`) con ayuda «Usa las flechas para girar; los botones + y − acercan y alejan»; lecturas y avisos en el DOM (no solo dibujados en el lienzo); botones reales; resultado de la consulta y errores en regiones `aria-live`; estado de carga «Cargando el visor 3D…».

Dependencias nuevas: `three` y `@types/three`, versiones exactas fijadas en `package.json` (el borrador usa three 0.160; se admite la última estable con tipos). Es la única dependencia nueva.

## Criterios de aceptación

- [ ] Libera los recursos de WebGL al salir de la vista (desmontaje) y al reemplazar la escena; probado con la escena simulada en los tests y comprobado en el navegador real.
- [ ] Mensaje claro si el navegador no tiene WebGL, sin romper la página.
- [ ] Recorte, lado máximo y exageración funcionan como en el borrador; la parcela rústica grande se muestra centrada y marcada como recortada.
- [ ] Lecturas correctas dentro de la parcela visible; avisos de recorte y orientativo.
- [ ] Referencia inválida: aviso y no se consulta.
- [ ] Accesible con teclado; lecturas y avisos en el DOM; todo en español; solo tokens; datos ficticios.
- [ ] `npm run lint`, `typecheck`, `test` y `build` en verde; three solo en el chunk del visor.
- [ ] Pantallazos en `docs/plans/RGB-34/screenshots/` (parcela residencial, parcela rústica recortada, exageración ×3, referencia inválida, sin WebGL; claro y oscuro donde aplique) enlazados en el PR.

## Flujo (4 subagentes)

Escritor de tests (Sonnet, rojo) → Desarrollador (Sonnet, sin tocar esos tests) → Tester (Sonnet, navegador real con WebGL por software, pantallazos) → Juez (Opus). Con veredicto aprobado se abre el PR con pantallazos, se monta el monitor del PR cada 30 s y la tarea pasa a «En revisión».
