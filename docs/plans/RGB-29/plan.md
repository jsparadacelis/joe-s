# RGB-29 · Pantalla de datos técnicos editables

Tarea de Notion: https://app.notion.com/p/3fd444f747b3812e8033d4e3e3038b2c
Tipo: Frontend · Épica E5 · P0 · Tamaño L
Depende de: RGB-24 (cliente del Catastro), RGB-27 (tablas técnicas), RGB-28 (modelo de dato técnico) — todos sin hacer — y RGB-10 (hecha).

## Decisión sobre la dependencia

Igual que RGB-10 y RGB-22: construimos contra datos de ejemplo ficticios y un contrato propio (`lib/datos-tecnicos.ts`) que el backend implementará. Se sustituye `obtenerDatosTecnicos` por el cliente de la API sin tocar los componentes. Toda consulta externa va por el servidor (regla del repo): el front nunca llama a Catastro, IGN, Open-Meteo ni PVGIS.

Comportamiento: «igual que el borrador navegable en comportamiento» (criterio de Notion). La referencia es el CSS/JS del borrador (`TECH_DEF`, `row`, `capacity`, `.trow`, `.tgroups`, `.capgrid`); las listas y opciones se copian **literalmente** de `TECH_DEF` (usos catastrales, zonas climáticas, aceleración sísmica `< 0,04 g` y 0,04 a 0,24 g, K 1,0 a 1,3, viento A a C, nieve 1 a 7, plantas PB a PB+5, superficie de cálculo, tipo de pendiente).

## Objetivo

En Briefing (fase 2), con la referencia catastral de la ficha como entrada, obtener los datos técnicos del inmueble y revisarlos: cada dato guarda valor, origen, valor original, si se editó y si está verificado.

## Alcance

- Panel «Datos técnicos del inmueble» en la pantalla de la fase 2 (`/proyectos/[codigo]/fase/2`), debajo del entregable genérico.
- Botón «Obtener datos técnicos» (tras obtenerlos: «Volver a consultar») con la referencia catastral prellenada y editable (20 caracteres alfanuméricos; si no cumple, aviso «La referencia catastral debe tener 20 caracteres.» y no se consulta). Mientras consulta: «Consultando…» y botón deshabilitado.
- Grupos: **Parcela** (12 datos), **Condiciones técnicas** (6), **Planeamiento** (8, manual) y **Capacidad** (calculada, solo lectura, se recalcula en vivo al editar).
- Por dato: etiqueta con su origen, control (lista con «Sin dato» para los de opciones; texto o número con unidad para el resto), chip «Editado» con «Valor de {origen}: {original o vacío}» y botón «Restaurar» cuando se cambia, casilla «Verificado».
- Contador: «{n} sin verificar» o «Todo verificado»; «{n} editados»; botón «Marcar todo como verificado».
- «Volver a consultar» sustituye los datos de origen (parcela y condiciones) y conserva los manuales (planeamiento).
- Modos (reglas de RGB-10): `edicion` todo editable; `solo-lectura` y `vista-previa` todo deshabilitado, sin consultar ni marcar; en solo lectura sin datos: «Sin datos técnicos registrados.»

Fuera de alcance: persistencia real, llamadas reales a servicios externos, alertas de cruce entre datos (RGB-31), brief manual y promoción (RGB-32), cálculo de capacidad en servidor (RGB-30; aquí una función pura sustituible), autenticación.

## Contrato de datos (`lib/datos-tecnicos.ts`)

```ts
export type GrupoId = 'parcela' | 'condiciones' | 'planeamiento';
export type TipoDato = 'texto' | 'numero' | 'lista';
export interface Grupo { id: GrupoId; nombre: string; descripcion: string }
export interface DefinicionDato {
  id: string; grupo: GrupoId; etiqueta: string; tipo: TipoDato;
  origen: string; unidad?: string; opciones?: readonly string[];
}
export const GRUPOS: readonly Grupo[];                  // 3 grupos, textos del borrador
export const DEFINICIONES: readonly DefinicionDato[];   // 26 datos, ids y textos de TECH_DEF del borrador (ver abajo)
export interface DatoTecnico { id: string; valor: string; original: string | null; verificado: boolean }  // original null = dato manual
export interface DatosTecnicos { referenciaCatastral: string; consultadoEl: string | null; datos: DatoTecnico[] }  // consultadoEl ISO yyyy-mm-dd
export function estaEditado(d: DatoTecnico): boolean;                         // original !== null && valor !== original
export function contarPendientes(datos: DatoTecnico[]): number;               // sin verificar
export function contarEditados(datos: DatoTecnico[]): number;
export function restaurarDato(d: DatoTecnico): DatoTecnico;                    // valor = original (si original null no cambia)
export function marcarTodoVerificado(datos: DatoTecnico[]): DatoTecnico[];
export function esReferenciaCatastralValida(ref: string): boolean;            // /^[0-9A-Za-z]{20}$/ tras trim
export function reconsultar(actual: DatoTecnico[], nuevos: DatoTecnico[]): DatoTecnico[];  // origen nuevo, manuales (planeamiento) conservados
export function obtenerDatosTecnicos(referenciaCatastral: string): Promise<DatosTecnicos>; // datos de ejemplo según la referencia
export function obtenerDatosTecnicosGuardados(codigo: string): Promise<DatosTecnicos | null>;
```

Ids de las `DEFINICIONES` (en este orden): parcela — `dir`, `muni`, `clase`, `uso`, `anyo`, `sc`, `spc`, `spp`, `coords`, `alt`, `pend`, `pendcat`; condiciones — `zc`, `ab`, `k`, `viento`, `nieve`, `fv`; planeamiento — `edif`, `ocup`, `altura`, `plantas`, `retv`, `retl`, `pmin`, `scalc`. Tipos, orígenes, unidades y opciones como `TECH_DEF` del borrador (p. ej. `clase`: lista Urbano / Rústico; `sc`: número en m²; `fv`: número en kWh/kWp·año; `plantas`: lista PB..PB+5; `scalc`: lista Catastral / Polígono / Topográfico).

`lib/capacidad.ts` (función pura, sustituible por el servicio RGB-30):

```ts
export interface Capacidad { superficie: number; techo: number; huella: number; porPlantas: number; maximo: number; limita: 'Edificabilidad' | 'Ocupación × plantas'; existente: number | null; parcelaMinima: number | null; cumpleParcelaMinima: boolean | null }
export function parseNumero(v: string): number | null;          // "1.240,5" → 1240.5; vacío o no numérico → null
export function formatearNumero(n: number | null, decimales?: number): string;  // es-ES; null → "—"
export function calcularCapacidad(datos: DatoTecnico[]): Capacidad | null;
```
Fórmula del borrador: superficie = `spp` si `scalc` es «Polígono», si no `spc`; techo = superficie × `edif`; huella = superficie × `ocup`/100; porPlantas = huella × plantas (PB=1 … PB+5=6); máximo = mínimo de techo y porPlantas; `limita` = «Edificabilidad» si techo ≤ porPlantas; `existente` = `sc`; `parcelaMinima` = `pmin`. Devuelve `null` si falta superficie, edificabilidad, ocupación o plantas.

Datos de ejemplo (ficticios): referencia `1234567DG3413S0001AB` (residencial: `CL EJEMPLO 12`, VIC (BARCELONA), Urbano, Residencial, 1958, sc 142, spc 96, spp 99,4, …) y cualquier otra de 20 caracteres (industrial: `PG EJEMPLO 4`, SABADELL, sc 1240, spc 3150, …), tomando los valores de `TECH_SRC` del borrador. Planeamiento llega vacío salvo `scalc` = «Catastral», con `original` null.

## Proyectos y rutas

- Nuevo proyecto de ejemplo `PRY-EJ-004` («Local comercial (ejemplo)») en **fase 2**, con referencia catastral `1234567DG3413S0001AB` en su ficha y plan de tiempos propio (`lib/tiempos.ts`) para que `/plan-y-tiempos` no falle. `obtenerDatosTecnicosGuardados`: `PRY-EJ-004` → null (para probar «Obtener»); `PRY-EJ-001` (fase 3, la 2 queda hecha) → datos ya verificados, con dos datos editados; el resto → null. Esto puede obligar a actualizar tests existentes que cuentan los proyectos de ejemplo (de 3 a 4); es legítimo y debe quedar anotado en el log.
- La pantalla de la fase 2 pasa a mostrar `DatosTecnicosEditor` además del entregable genérico. Las demás fases no cambian.

## Componentes (`components/proyecto/datos-tecnicos/`)

- `DatosTecnicosEditor({ referenciaCatastral, inicial, modo, consultar? })` (Client Component): estado local (sin persistencia); `consultar` por defecto `obtenerDatosTecnicos` (inyectable en tests).
- `FilaDato`, `PanelGrupo`, `PanelCapacidad`, `ResumenVerificacion`: piezas pequeñas y composables.
- Todo texto en español, solo tokens, etiquetas asociadas a cada control, estado «Editado» / «Verificado» también en texto, `aria-live` para el resultado de la consulta y el contador.

## Criterios de aceptación

- [ ] Igual que el borrador navegable en comportamiento: obtener, listas con «Sin dato», editado con valor original y Restaurar, verificado, contador de pendientes y editados, Marcar todo como verificado, volver a consultar conservando manuales, capacidad en vivo.
- [ ] Referencia catastral inválida: aviso y no se consulta.
- [ ] En solo lectura y vista previa nada se puede cambiar ni consultar.
- [ ] Accesible con teclado; estados no dependen solo del color; todo en español; solo tokens; datos ficticios.
- [ ] `npm run lint`, `typecheck`, `test` y `build` en verde.
- [ ] Pantallazos en `docs/plans/RGB-29/screenshots/` (PRY-EJ-004 antes de consultar, tras consultar con datos editados y verificados y la capacidad, PRY-EJ-001 en solo lectura, PRY-EJ-002 en vista previa; claro y oscuro) enlazados en el PR.

## Flujo (4 subagentes)

Escritor de tests (Sonnet, rojo) → Desarrollador (Sonnet, sin tocar esos tests) → Tester (Sonnet, pantallazos con el build real) → Juez (Opus). Con veredicto aprobado se abre el PR con pantallazos, se monta el monitor del PR cada 30 s y la tarea pasa a «En revisión».
