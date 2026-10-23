/**
 * Contrato de tiempos de RGB-22 y capa de datos de EJEMPLO (ficticios).
 * El servicio de tiempos (RGB-20/21) calcula semanas activas, pausa, totales,
 * calendario y desviación; el front los muestra tal cual y solo deriva el
 * porcentaje de consumo y el semáforo (lógica de presentación).
 */
import type { FaseId } from "@/lib/fases";

export type FaseConPlan = Exclude<FaseId, 0>;
export type MotivoPausa = "espera-cliente" | "espera-organismo" | "decision-interna" | "otra";

export const ETIQUETA_MOTIVO: Record<MotivoPausa, string> = {
  "espera-cliente": "Espera del cliente",
  "espera-organismo": "Espera de organismo",
  "decision-interna": "Decisión interna",
  otra: "Otra",
};

export interface TiempoFase {
  fase: FaseConPlan;
  planSemanas: number;
  activasSemanas: number;
  pausaSemanas: number;
}

/** Fechas ISO yyyy-mm-dd. */
export interface Pausa {
  desde: string;
  hasta: string | null;
  fase: FaseConPlan;
  motivo: MotivoPausa;
  semanas: number;
}

export interface PausaActiva {
  desde: string;
  motivo: MotivoPausa;
  reanudacionPrevista: string;
}

export interface PlanTiempos {
  codigo: string;
  faseActual: FaseConPlan;
  /** Siempre 7 entradas, fases 1..7 en orden. */
  fases: TiempoFase[];
  /** Historial, de más reciente a más antigua. */
  pausas: Pausa[];
  pausaActiva: PausaActiva | null;
  totalActivasSemanas: number;
  totalPlanSemanas: number;
  totalPausaSemanas: number;
  calendarioSemanas: number;
  /** Activas frente a plan acumulado; positivo = retraso. */
  desviacionSemanas: number;
}

export type Semaforo = "verde" | "ambar" | "rojo";

export const ETIQUETA_SEMAFORO: Record<Semaforo, string> = {
  verde: "En plazo",
  ambar: "Atención",
  rojo: "Plan superado",
};

/** Porcentaje entero de consumo (sin límite superior). Plan <= 0 devuelve 0. */
export function porcentajeConsumo(activas: number, plan: number): number {
  if (plan <= 0) return 0;
  return Math.round((activas / plan) * 100);
}

/**
 * Única fuente de verdad del semáforo. Decide con el valor real (enteros, sin
 * redondeo): rojo si activas > plan; ámbar desde el 80 % (activas/plan >= 4/5).
 */
export function semaforoConsumo(activas: number, plan: number): Semaforo {
  if (plan <= 0) return "verde";
  if (activas > plan) return "rojo";
  return activas * 5 >= plan * 4 ? "ambar" : "verde";
}

/** Fecha ISO yyyy-mm-dd a dd/mm/aaaa, sin pasar por Date (sin husos horarios). */
export function formatearFecha(iso: string): string {
  const [anio, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${anio}`;
}

// ---- DATOS DE EJEMPLO (sustituible por el cliente de la API) ----

const PLAN_SEMANAS = [2, 3, 5, 6, 8, 36, 4] as const;

function fasesDeEjemplo(activas: readonly number[], pausa: readonly number[]): TiempoFase[] {
  return PLAN_SEMANAS.map((planSemanas, i) => ({
    fase: (i + 1) as FaseConPlan,
    planSemanas,
    activasSemanas: activas[i],
    pausaSemanas: pausa[i],
  }));
}

const PLANES: readonly PlanTiempos[] = [
  {
    codigo: "PRY-EJ-001",
    faseActual: 3,
    fases: fasesDeEjemplo([3, 4, 4, 0, 0, 0, 0], [0, 3, 1, 0, 0, 0, 0]),
    pausas: [
      { desde: "2026-08-03", hasta: "2026-08-10", fase: 3, motivo: "espera-cliente", semanas: 1 },
      { desde: "2026-05-04", hasta: "2026-05-25", fase: 2, motivo: "decision-interna", semanas: 3 },
    ],
    pausaActiva: null,
    totalActivasSemanas: 11,
    totalPlanSemanas: 64,
    totalPausaSemanas: 4,
    calendarioSemanas: 15,
    desviacionSemanas: 1,
  },
  {
    codigo: "PRY-EJ-003",
    faseActual: 6,
    fases: fasesDeEjemplo([2, 3, 5, 6, 8, 30, 0], [0, 0, 0, 1, 0, 2, 0]),
    pausas: [
      { desde: "2026-10-12", hasta: null, fase: 6, motivo: "espera-organismo", semanas: 2 },
      { desde: "2026-03-02", hasta: "2026-03-09", fase: 4, motivo: "espera-cliente", semanas: 1 },
    ],
    pausaActiva: { desde: "2026-10-12", motivo: "espera-organismo", reanudacionPrevista: "2026-11-09" },
    totalActivasSemanas: 54,
    totalPlanSemanas: 64,
    totalPausaSemanas: 3,
    calendarioSemanas: 57,
    desviacionSemanas: 0,
  },
  {
    codigo: "PRY-EJ-004",
    faseActual: 2,
    fases: fasesDeEjemplo([2, 1, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]),
    pausas: [],
    pausaActiva: null,
    totalActivasSemanas: 3,
    totalPlanSemanas: 64,
    totalPausaSemanas: 0,
    calendarioSemanas: 3,
    desviacionSemanas: 0,
  },
];

// ---- Función pública (misma firma que el cliente de la API) ----

/** null: el proyecto no tiene plan (fase 0) o no existe. Devuelve copias. */
export async function obtenerPlanTiempos(codigo: string): Promise<PlanTiempos | null> {
  const plan = PLANES.find((p) => p.codigo === codigo);
  if (!plan) return null;
  return {
    ...plan,
    fases: plan.fases.map((f) => ({ ...f })),
    pausas: plan.pausas.map((p) => ({ ...p })),
    pausaActiva: plan.pausaActiva ? { ...plan.pausaActiva } : null,
  };
}
