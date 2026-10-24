# Contrato asumido · tests en rojo de connect-api-settings

Firmas que fijan los tests de `frontend/__tests__/`. El Desarrollador las respeta tal cual; un test incorrecto se corrige justificándolo, no se debilita.

## Contrato asumido

### `@/lib/api` (`frontend/lib/api.ts`)

```ts
export class ApiError extends Error {
  constructor(status: number, code: string, message: string);
  readonly status: number;   // 0 = network failure / CORS
  readonly code: string;
}

export type ApiRequest = <T = unknown>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>;

export interface ApiClientOptions {
  baseUrl?: string;                       // default: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000" (read when the client is created)
  fetch?: (input: string, init?: RequestInit) => Promise<ResponseLike>;  // default: globalThis.fetch resolved at call time
}
export function createApiClient(options?: ApiClientOptions): { request: ApiRequest };
export const request: ApiRequest;         // default client
```

- URL = base sin barra final + `path`. El método por defecto es `GET` (se pasa `method: "GET"` a fetch y sin `body`). Con `body`: `JSON.stringify(body)` y cabecera `Content-Type: application/json` (los tests la leen con `new Headers(init.headers)`).
- La respuesta solo se usa por `ok`, `status` y `text()`/`json()` (los tests inyectan un objeto mínimo, no un `Response` real). `204` -> `undefined`.
- No 2xx: `{ detail: { code: string, message: string } }` -> `ApiError(status, code, message)`. Cualquier otro cuerpo (detail en lista, detail string, detail sin `message`, HTML, vacío, JSON sin detail) -> `code "unexpected_error"`, mensaje `Ocurrió un error inesperado. Inténtalo de nuevo.` conservando el `status`.
- `fetch` lanza -> `ApiError(0, "network_error", "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.")`.

### `@/lib/plan-settings` (`frontend/lib/plan-settings.ts`)

```ts
export type ProjectType = "single_family_house" | "rehabilitation" | "multi_family" | "facility" | "industrial" | "renovation_interiors";
export type Scale = "small" | "medium" | "large";
export const PROJECT_TYPES: readonly ProjectType[];            // en ese orden
export const SCALES: readonly Scale[];                         // small, medium, large
export const PROJECT_TYPE_LABELS: Record<ProjectType, string>; // Vivienda unifamiliar, Rehabilitación, Plurifamiliar, Dotacional, Industrial, Reforma de interiores
export const SCALE_LABELS: Record<Scale, string>;              // Pequeña, Media, Grande

export interface PlanSettings { templates: Record<ProjectType, number[]>; scaleFactors: Record<Scale, number> }

export function fetchPlanSettings(request?: ApiRequest): Promise<PlanSettings>;                       // GET /api/settings/plan; mapea scale_factors -> scaleFactors (solo aquí)
export function updateTemplate(type: ProjectType, weeks: number[], request?: ApiRequest): Promise<void>;   // PUT /api/settings/plan/templates/{type}  body { weeks }
export function updateScaleFactor(scale: Scale, factor: number, request?: ApiRequest): Promise<void>;     // PUT /api/settings/plan/scale-factors/{scale} body { factor }
export const MAX_WEEKS = 520;
export const MIN_FACTOR = 0.1;
export const MAX_FACTOR = 10;
export function validateWeeks(weeks: number[]): string | null; // 7 enteros, cada uno 1..MAX_WEEKS (520 vale, 521 no)
export function validateFactor(factor: number): string | null; // finito, MIN_FACTOR <= f <= MAX_FACTOR (0.1 vale, 0.09 y 1e-10 no)
```

`request` por defecto es el `request` de `@/lib/api`. Mensajes (cambian respecto a la primera ronda, que decía «de al menos 1» y «mayor que 0 y como máximo 10»; el backend debería alinear sus topes y textos):
- weeks: `Cada plantilla necesita exactamente 7 valores de semanas, enteros y entre 1 y 520.`
- factor: `El factor de escala debe ser un número entre 0,1 y 10.`
- Valores que deben rechazarse sin llamar a la API: 521, 2147483648, 99999999999, 1e21 semanas; factores 0.09, 1e-10. Se aceptan 520 semanas y factor 0.1.

### `@/components/settings/PlanSettingsEditor` (`frontend/components/settings/PlanSettingsEditor.tsx`, `"use client"`)

```ts
export interface PlanSettingsUpdater {
  updateTemplate(type: ProjectType, weeks: number[]): Promise<void>;
  updateScaleFactor(scale: Scale, factor: number): Promise<void>;
}
export interface PlanSettingsEditorProps {
  fetcher?: () => Promise<PlanSettings>;   // default: () => fetchPlanSettings()
  updater?: PlanSettingsUpdater;           // default: { updateTemplate, updateScaleFactor } de @/lib/plan-settings
}
export function PlanSettingsEditor(props: PlanSettingsEditorProps): JSX.Element; // export con nombre
```

Estructura que consultan los tests (todo en español):
- Carga: texto `Cargando ajustes del plan…`; el `fetcher` se llama una vez al montar. Error de carga: `role="alert"` con el mensaje del `ApiError` (otro error -> mensaje inesperado) y botón `Reintentar` que vuelve a llamar al `fetcher`.
- Dos encabezados `h2`: `Plantillas de semanas por tipología` y `Factores de escala`; texto de ayuda exacto: `Los cambios se aplican a los planes que se generen a partir de ahora y quedan en el registro de auditoría.`
- Una fila por tipología: `role="group"` (p. ej. `<fieldset>` + `<legend>`) con nombre accesible = etiqueta de la tipología. Dentro: 7 `<input type="number">` con etiqueta `Fase {n}: {nombre}` (n = 1..7; Inicio, Briefing y concepto, Anteproyecto, Proyecto básico, Proyecto de ejecución, Obra, Cierre, tomados de `PHASES`), el texto `Total: {suma} semanas` (en vivo) y un botón `Guardar`.
- Una fila por escala: `role="group"` con nombre = etiqueta de la escala (Pequeña, Media, Grande), un `<input type="number">` con etiqueta `Factor de escala {escala}` y un botón `Guardar`.
- `Guardar` deshabilitado si el valor no difiere del guardado (comparación por valor: volver al valor guardado lo deshabilita) o mientras guarda. Entrada vacía/no válida: se valida con `validateWeeks`/`validateFactor` sin llamar al `updater`; el mensaje aparece dentro del grupo, en un elemento con `id`, y los campos del grupo llevan `aria-invalid="true"` y `aria-describedby` que incluye ese id (todos los 7 campos en una plantilla). Lo mismo para el rechazo del servidor (mensaje del `ApiError`; otros errores -> mensaje inesperado); lo escrito se conserva y `Guardar` sigue habilitado. Un guardado correcto limpia el error y las marcas.
- Éxito: tras guardar, el valor guardado pasa a ser el escrito. Mensaje `Plantilla de {tipología} guardada.` / `Factor de escala {escala} guardado.` dentro de una región `aria-live="polite"` que ya existe (vacía) antes de guardar, una sola para todo el editor.
- Se llama a `updater.updateTemplate(type, number[])` / `updater.updateScaleFactor(scale, number)` con números, no cadenas.
- Sin violaciones de `jest-axe` en cargando, error de carga, cargado y con error de servidor.

Comportamientos añadidos en la ronda de correcciones:
- Total en vivo: `Total: {N} semanas` solo si los 7 valores son enteros válidos (1..520); en otro caso el elemento contiene exactamente `Total: —` (guion largo), nunca `e+`, decimales, `NaN` ni `Infinity`.
- Foco: tras un guardado correcto (clic o Enter en `Guardar`) el foco queda en el último campo de la fila que lo tuvo (el campo que se editaba), nunca en `body`. Si no hubo ninguno, el primer campo de la fila.
- Foco tras error: si el guardado falla (422, 500 o `network_error`) el foco también vuelve al campo recordado de la fila (o al primero), el mismo que lleva `aria-invalid`, nunca a `body` aunque `Guardar` se deshabilite mientras guarda.
- Mensaje de éxito: se vacía (la región `aria-live` queda sin contenido) en cuanto se edita cualquier campo de cualquier fila; así, guardar dos veces la misma fila vuelve a anunciar el texto (vacía -> texto).
- Un 422 del servidor con `detail` en lista (validación FastAPI) llega como `ApiError(422, "unexpected_error", ...)`; el editor muestra el mensaje genérico `Ocurrió un error inesperado. Inténtalo de nuevo.` en la fila, con `aria-invalid` y `Guardar` habilitado.

### `@/app/settings/page` (`frontend/app/settings/page.tsx`)

Componente de servidor, `export default function Page()`, sin props: `PageHead` con título `Ajustes y equipo` y descripción `Configuración general y gestión del equipo.`, seguido de `<PlanSettingsEditor />` (sin `EmptyState`). Mantener `metadata.title`.

### Otros cambios en tests existentes

`frontend/__tests__/app/pages.test.tsx`: se quitó `Ajustes y equipo` de la tabla de pantallas con estado vacío (ya no es un estado vacío) y `nada configurado` de la regex. Cubre la página el nuevo `__tests__/app/settings.test.tsx`.
