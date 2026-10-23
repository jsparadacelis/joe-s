# RGB-22 · Pestaña «Plan y tiempos» y semáforo por consumo

Tarea de Notion: https://app.notion.com/p/3fd444f747b381978322c1471cf68499
Tipo: Frontend · Épica E4 · P1 · Tamaño M
Depende de: RGB-21 (pausas, full-stack, sin hacer), RGB-20 (cálculo de tiempos, backend, sin hacer) y RGB-10 (hecha).

## Decisión sobre la dependencia

Igual que RGB-10: el servicio de tiempos no existe, así que el front define el contrato como tipos TypeScript y lo sirve desde datos de ejemplo ficticios (`lib/tiempos.ts`). Cuando exista RGB-20/21 se sustituye `obtenerPlanTiempos` por el cliente de la API sin tocar los componentes.

Regla de reparto: **el servicio calcula** semanas activas, pausa, totales, calendario y desviación (RGB-20). **El front solo muestra esos números tal cual** (criterio «los números coinciden con el servicio») y deriva únicamente porcentaje de consumo y semáforo, que son lógica de presentación pura.

## Objetivo

Seguimiento del total, no solo de la fase: resumen, tabla por fase con barras de consumo, historial de pausas y semáforo automático (ámbar desde el 80 % del plan de la fase, rojo al superarlo).

## Alcance

- Pestañas del proyecto: «Fase y promoción» (lleva a la fase actual) y «Plan y tiempos». Hoy el proyecto no tiene pestañas; se añade `ProyectoTabs` vía `app/proyectos/[codigo]/layout.tsx`.
- Ruta `/proyectos/[codigo]/plan-y-tiempos`.
- Resumen: total activo frente a plan (semanas), fase actual y su porcentaje de consumo, semanas en pausa, calendario total, desviación. Si hay una pausa activa, aviso con motivo y fecha prevista de reanudación.
- Tabla por fase (fases 1 a 7; la fase 0 no tiene plan): plan, activas, pausa, estado (hecha / actual / pendiente), barra de consumo con porcentaje y etiqueta del semáforo.
- Historial de pausas.
- Proyecto sin plan (fase 0): estado vacío «Sin plan hasta promover».

Fuera de alcance: crear, pausar o reanudar (RGB-21), cálculo de tiempos (RGB-20), semanas en la cartera (RGB-23), autenticación.

## Contrato de datos (para el backend, RGB-20/21)

`lib/tiempos.ts`

```ts
import type { FaseId } from '@/lib/fases';
export type FaseConPlan = Exclude<FaseId, 0>;                 // 1..7
export type MotivoPausa = 'espera-cliente' | 'espera-organismo' | 'decision-interna' | 'otra';
export const ETIQUETA_MOTIVO: Record<MotivoPausa, string>;     // 'Espera del cliente' | 'Espera de organismo' | 'Decisión interna' | 'Otra'
export interface TiempoFase { fase: FaseConPlan; planSemanas: number; activasSemanas: number; pausaSemanas: number }
export interface Pausa { desde: string; hasta: string | null; fase: FaseConPlan; motivo: MotivoPausa; semanas: number }  // fechas ISO yyyy-mm-dd
export interface PausaActiva { desde: string; motivo: MotivoPausa; reanudacionPrevista: string }
export interface PlanTiempos {
  codigo: string;
  faseActual: FaseConPlan;
  fases: TiempoFase[];                // siempre 7 entradas, fases 1..7 en orden
  pausas: Pausa[];                    // historial, de más reciente a más antigua
  pausaActiva: PausaActiva | null;
  totalActivasSemanas: number;        // los da el servicio; el front no los suma
  totalPlanSemanas: number;
  totalPausaSemanas: number;
  calendarioSemanas: number;
  desviacionSemanas: number;          // activas frente a plan acumulado; positivo = retraso
}
export function obtenerPlanTiempos(codigo: string): Promise<PlanTiempos | null>;   // null: el proyecto no tiene plan (fase 0) o no existe
export type Semaforo = 'verde' | 'ambar' | 'rojo';
export const ETIQUETA_SEMAFORO: Record<Semaforo, string>;      // 'En plazo' | 'Atención' | 'Plan superado'
export function porcentajeConsumo(activas: number, plan: number): number;   // Math.round(activas/plan*100); plan <= 0 → 0
export function semaforoConsumo(activas: number, plan: number): Semaforo;  // activas > plan: rojo; activas/plan >= 0.8: ámbar; si no: verde; plan <= 0 → verde
```

Fronteras del semáforo: 79 % verde, 80 % ámbar, 100 % ámbar (igual al plan), >100 % rojo. Una fase futura (activas 0) es verde.

Datos de ejemplo (ficticios, dentro de `lib/tiempos.ts` en un bloque marcado como sustituible):
- `PRY-EJ-001` (fase 3): plan por fase `[2,3,5,6,8,36,4]`, activas `[3,4,4,0,0,0,0]`, pausa `[0,3,1,0,0,0,0]`, totales activas 11, plan 64, pausa 4, calendario 15, desviación +1, sin pausa activa, 2 pausas en el historial.
- `PRY-EJ-002` (fase 0): `obtenerPlanTiempos` devuelve `null`.
- `PRY-EJ-003` (fase 6): plan `[2,3,5,6,8,36,4]`, activas `[2,3,5,6,8,30,0]`, pausa `[0,0,0,1,0,2,0]`, con `pausaActiva` (espera de organismo, reanudación prevista en el futuro respecto a «hoy» fijo en los datos).

## Rutas

- `/proyectos/[codigo]/plan-y-tiempos`: 404 si el proyecto no existe; con proyecto sin plan muestra el estado vacío «Sin plan hasta promover».
- `app/proyectos/[codigo]/layout.tsx`: carga el proyecto (404 si no existe) y pinta `ProyectoTabs` encima de `children`. Aplica a las rutas `fase/[fase]` y `plan-y-tiempos`.

## Componentes

`components/proyecto/ProyectoTabs({ codigo, faseActual })` (Client Component por `usePathname`): `<nav aria-label="Secciones del proyecto">` con dos enlaces: «Fase y promoción» → `/proyectos/${codigo}/fase/${faseActual}` y «Plan y tiempos» → `/proyectos/${codigo}/plan-y-tiempos`. `aria-current="page"` en el que corresponda a la ruta (cualquier `/fase/*` activa la primera).

`components/tiempos/`:
- `ResumenTiempos({ plan })`: tarjetas/estadísticas con los valores del servicio tal cual («11 / 64 sem» total, «4 sem en pausa», «15 sem de calendario», «+1 sem de desviación»), fase actual y porcentaje de consumo de esa fase con su semáforo. Si hay `pausaActiva`, un `Notice` con el motivo y la reanudación prevista (`role="status"`).
- `TablaTiempos({ fases, faseActual })`: `Table` con columnas Fase, Plan, Activas, Pausa, Estado, Consumo. Estado: «Hecha» / «Actual» / «Pendiente». Consumo: barra con `role="progressbar"` (`aria-valuenow` = porcentaje, `aria-valuemin` 0, `aria-valuemax` 100, `aria-label` con el nombre de la fase), ancho limitado al 100 %, color por semáforo con tokens (`ok`, `warn`, `bad`), y a su lado el porcentaje y la etiqueta del semáforo en texto (el estado nunca depende solo del color).
- `HistorialPausas({ pausas })`: tabla con Desde–Hasta («en curso» si `hasta` es null), Fase, Motivo (etiqueta en español), Semanas. Sin pausas: «Sin pausas registradas».
- Páginas: Server Components.

Todo con tokens existentes y los componentes de `components/ui`; foco visible heredado; todo texto en español.

## Criterios de aceptación

- [ ] Los números coinciden con el servicio de tiempos (el front no recalcula totales: muestra los del contrato).
- [ ] Semáforo: verde por debajo del 80 %, ámbar desde el 80 % hasta el plan, rojo al superarlo; probado en las fronteras.
- [ ] Pausa activa visible con motivo y fecha prevista; historial de pausas.
- [ ] Proyecto sin plan: estado vacío claro, sin errores.
- [ ] El estado (semáforo, hecha/actual/pendiente) se entiende sin color; barra accesible; teclado.
- [ ] Todo en español, solo tokens, datos ficticios.
- [ ] `npm run lint`, `typecheck`, `test` y `build` en verde.
- [ ] Pantallazos en `docs/plans/RGB-22/screenshots/` (PRY-EJ-001 con ámbar/rojo, PRY-EJ-003 con pausa activa, PRY-EJ-002 sin plan; claro y oscuro) enlazados en el PR.

## Flujo (4 subagentes)

1. **Escritor de tests** (Sonnet): tests desde este plan, en rojo, sin tocar código de producción.
2. **Desarrollador** (Sonnet): implementa sin modificar esos tests.
3. **Tester** (Sonnet): verifica, intenta romper, saca los pantallazos con el build real.
4. **Juez** (Opus): aprobado o rechazado.

Con veredicto aprobado se abre el PR (con pantallazos), se monta el monitor del PR y la tarea pasa a «En revisión».
