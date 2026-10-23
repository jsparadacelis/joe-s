# RGB-10 · Línea de fases navegable

Tarea de Notion: https://app.notion.com/p/3fd444f747b3812385e9c52bb04bc6d2
Tipo: Frontend · Épica E1 · P0 · Tamaño M
Depende de: RGB-9 (servicio de promoción, backend, sin hacer) y RGB-6 (hecha).

## Decisión sobre la dependencia

RGB-9 no existe. Decisión del usuario (2026-10-23): construir RGB-10 contra datos de ejemplo. El front define el contrato de datos como tipos TypeScript y lo sirve desde un módulo con datos ficticios; cuando exista el backend se sustituye esa capa sin tocar los componentes. Los datos de ejemplo son ficticios (regla: nada de datos reales de clientes).

## Objetivo

Las 8 fases del proyecto se muestran en una línea clicable. Las anteriores enseñan su entregable congelado, las siguientes una vista previa; solo la actual se edita.

## Alcance

- Componente de línea de fases con estado `hecha`, `actual`, `vista`.
- Ruta por fase dentro del proyecto y botón/enlace «Volver a la fase actual».
- Tres modos de pantalla: edición (fase actual), solo lectura (anteriores, con versión congelada) y vista previa (siguientes, sin guardado y con aviso).
- Lista mínima en `/proyectos` para llegar a los proyectos de ejemplo.

Fuera de alcance: persistencia real, promover/retener (RGB-9 y tareas posteriores), contenido real de cada entregable, cartera (RGB-11), autenticación.

## Referencia visual

Borrador navegable de Notion (tira de fases `.cycle-grid.strip`, 8 columnas: hecha en `ok-soft`, actual en `point` con texto `on-point`, vista en `surface-2`, la fase en pantalla marcada con anillo; barra «Volviendo a la fase actual»). Usa solo los tokens existentes de `app/globals.css`.

## Contrato de datos (para el backend, RGB-9)

`lib/fases.ts`

```ts
export type FaseId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export interface Fase { id: FaseId; nombre: string; entregable: string; promueve: string }
export const FASES: readonly Fase[];            // 8 fases, orden 0..7, textos del PRD
export type EstadoFase = 'hecha' | 'actual' | 'vista';
export type ModoFase = 'edicion' | 'solo-lectura' | 'vista-previa';
export function estadoFase(fase: FaseId, actual: FaseId): EstadoFase;   // < actual: hecha, = actual: actual, > actual: vista
export function modoFase(fase: FaseId, actual: FaseId): ModoFase;       // hecha: solo-lectura, actual: edicion, vista: vista-previa
export function parseFaseId(raw: string): FaseId | null;               // "0".."7" exactos; cualquier otra cosa: null
```

`lib/proyectos.ts` (capa de datos de ejemplo; mismas firmas que tendrá el cliente de la API)

```ts
export interface Proyecto { codigo: string; nombre: string; faseActual: FaseId }
export type TipoCampo = 'texto' | 'area' | 'fecha';
export interface Campo { id: string; etiqueta: string; tipo: TipoCampo; valor: string }
export interface EntregableFase { fase: FaseId; versionCongelada: string | null; campos: Campo[] }
export function listarProyectos(): Promise<Proyecto[]>;
export function obtenerProyecto(codigo: string): Promise<Proyecto | null>;
export function obtenerEntregable(codigo: string, fase: FaseId): Promise<EntregableFase>;
```

Datos de ejemplo (ficticios, con «(ejemplo)» en el nombre): `PRY-EJ-001` en fase 3, `PRY-EJ-002` en fase 0, `PRY-EJ-003` en fase 6. `versionCongelada` es `null` salvo en fases hechas (p. ej. `"v1"`).

## Rutas

- `/proyectos`: lista de proyectos de ejemplo, cada uno enlaza a su fase actual.
- `/proyectos/[codigo]`: redirige a `/proyectos/[codigo]/fase/[faseActual]`; 404 si el proyecto no existe.
- `/proyectos/[codigo]/fase/[fase]`: pantalla de fase. 404 si el proyecto no existe o `fase` no es 0..7.

## Componentes (`components/proyecto/`)

- `PhaseTimeline({ codigo, faseActual, faseVista })`: `<nav aria-label="Fases del proyecto">` con `<ol>` de 8 `<Link>` a `/proyectos/${codigo}/fase/${id}`. Cada ítem muestra número y nombre y un texto accesible del estado («hecha», «actual», «vista»). El ítem de la fase en pantalla lleva `aria-current="page"`. Estilos solo con tokens; foco visible heredado.
- `ModoBanner({ codigo, faseActual, faseVista })`: en `solo-lectura` un `Notice` «Fase cerrada · versión congelada» y en `vista-previa` un `Notice` «Vista previa: nada se guarda en esta fase». En ambos, enlace «Volver a la fase actual» a la fase actual. En `edicion` no renderiza nada.
- `FaseEntregable({ entregable, modo, onGuardar? })`: formulario con los campos del entregable. `edicion`: campos editables y botón «Guardar» que llama a `onGuardar` (por defecto no hace nada: la persistencia llega en tareas posteriores). `solo-lectura`: todos los campos `readOnly`/`disabled`, sin botón de guardar, se muestra la versión congelada. `vista-previa`: todos los campos `disabled`, sin botón de guardar.
- Páginas: Server Components; solo lo necesario como Client Component.

## Criterios de aceptación

- [ ] En una fase anterior todos los campos están en solo lectura.
- [ ] En una fase siguiente nada se guarda y se ve un aviso de vista previa.
- [ ] Accesible con teclado (Tab recorre las 8 fases y el enlace de volver; foco visible).
- [ ] Todo texto en español; colores solo de tokens; sin datos reales.
- [ ] `npm run lint`, `typecheck`, `test` y `build` en verde.
- [ ] Pantallazos en `docs/plans/RGB-10/screenshots/` (fase actual, fase anterior, fase siguiente; claro y oscuro) enlazados en el PR.

## Flujo (4 subagentes)

1. **Escritor de tests** (Sonnet): escribe los tests desde este plan, antes de implementar (deben fallar por no existir el código); no toca código de producción.
2. **Desarrollador** (Sonnet): implementa hasta ponerlos en verde, con buenas prácticas; si un test es incorrecto lo justifica en el log en lugar de debilitarlo.
3. **Tester** (Sonnet): verifica criterios, intenta romper, genera los pantallazos con el build real.
4. **Juez** (Opus): contrasta diff, plan, criterios y pantallazos; aprobado o rechazado.

Solo con veredicto aprobado se abre el PR (con pantallazos) y la tarea pasa a «En revisión».
