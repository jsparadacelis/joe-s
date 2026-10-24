/**
 * Contrato de tiempos de RGB-22 y capa de datos de EJEMPLO (ficticios).
 * El servicio de tiempos (RGB-20/21) calcula semanas activas, pausa, totales,
 * calendario y desviación; el front los muestra tal cual y solo deriva el
 * porcentaje de consumo y el semáforo (lógica de presentación).
 */
import type { PhaseId } from "@/lib/phases";

export type PlannedPhase = Exclude<PhaseId, 0>;
export type PauseReason = "client-wait" | "authority-wait" | "internal-decision" | "other";

export const REASON_LABEL: Record<PauseReason, string> = {
  "client-wait": "Espera del cliente",
  "authority-wait": "Espera de organismo",
  "internal-decision": "Decisión interna",
  other: "Otra",
};

export interface PhaseTiming {
  phase: PlannedPhase;
  plannedWeeks: number;
  activeWeeks: number;
  pausedWeeks: number;
}

/** Fechas ISO yyyy-mm-dd. */
export interface Pause {
  from: string;
  to: string | null;
  phase: PlannedPhase;
  motivo: PauseReason;
  weeks: number;
}

export interface ActivePause {
  from: string;
  motivo: PauseReason;
  expectedResumption: string;
}

export interface TimingPlan {
  code: string;
  currentPhase: PlannedPhase;
  /** Siempre 7 entradas, fases 1..7 en orden. */
  phases: PhaseTiming[];
  /** Historial, de más reciente a más antigua. */
  pauses: Pause[];
  activePause: ActivePause | null;
  totalActiveWeeks: number;
  totalPlannedWeeks: number;
  totalPausedWeeks: number;
  calendarioSemanas: number;
  /** Activas frente a plan acumulado; positivo = retraso. */
  deviationWeeks: number;
}

export type TrafficLight = "green" | "amber" | "red";

export const TRAFFIC_LIGHT_LABEL: Record<TrafficLight, string> = {
  green: "En plazo",
  amber: "Atención",
  red: "Plan superado",
};

/** Porcentaje entero de consumo (sin límite superior). Plan <= 0 devuelve 0. */
export function consumptionPercent(active: number, plan: number): number {
  if (plan <= 0) return 0;
  return Math.round((active / plan) * 100);
}

/**
 * Única fuente de verdad del semáforo. Decide con el valor real (enteros, sin
 * redondeo): rojo si activas > plan; ámbar desde el 80 % (activas/plan >= 4/5).
 */
export function consumptionTrafficLight(active: number, plan: number): TrafficLight {
  if (plan <= 0) return "green";
  if (active > plan) return "red";
  return active * 5 >= plan * 4 ? "amber" : "green";
}

/** Fecha ISO yyyy-mm-dd a dd/mm/aaaa, sin pasar por Date (sin husos horarios). */
export function formatDate(iso: string): string {
  const [year, mes, day] = iso.split("-");
  return `${day}/${mes}/${year}`;
}

// ---- DATOS DE EJEMPLO (sustituible por el cliente de la API) ----

const PLANNED_WEEKS = [2, 3, 5, 6, 8, 36, 4] as const;

function samplePhases(active: readonly number[], pause: readonly number[]): PhaseTiming[] {
  return PLANNED_WEEKS.map((plannedWeeks, i) => ({
    phase: (i + 1) as PlannedPhase,
    plannedWeeks,
    activeWeeks: active[i],
    pausedWeeks: pause[i],
  }));
}

const PLANS: readonly TimingPlan[] = [
  {
    code: "PRY-EJ-001",
    currentPhase: 3,
    phases: samplePhases([3, 4, 4, 0, 0, 0, 0], [0, 3, 1, 0, 0, 0, 0]),
    pauses: [
      { from: "2026-08-03", to: "2026-08-10", phase: 3, motivo: "client-wait", weeks: 1 },
      { from: "2026-05-04", to: "2026-05-25", phase: 2, motivo: "internal-decision", weeks: 3 },
    ],
    activePause: null,
    totalActiveWeeks: 11,
    totalPlannedWeeks: 64,
    totalPausedWeeks: 4,
    calendarioSemanas: 15,
    deviationWeeks: 1,
  },
  {
    code: "PRY-EJ-003",
    currentPhase: 6,
    phases: samplePhases([2, 3, 5, 6, 8, 30, 0], [0, 0, 0, 1, 0, 2, 0]),
    pauses: [
      { from: "2026-10-12", to: null, phase: 6, motivo: "authority-wait", weeks: 2 },
      { from: "2026-03-02", to: "2026-03-09", phase: 4, motivo: "client-wait", weeks: 1 },
    ],
    activePause: { from: "2026-10-12", motivo: "authority-wait", expectedResumption: "2026-11-09" },
    totalActiveWeeks: 54,
    totalPlannedWeeks: 64,
    totalPausedWeeks: 3,
    calendarioSemanas: 57,
    deviationWeeks: 0,
  },
  {
    code: "PRY-EJ-004",
    currentPhase: 2,
    phases: samplePhases([2, 1, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]),
    pauses: [],
    activePause: null,
    totalActiveWeeks: 3,
    totalPlannedWeeks: 64,
    totalPausedWeeks: 0,
    calendarioSemanas: 3,
    deviationWeeks: 0,
  },
];

// ---- Función pública (misma firma que el cliente de la API) ----

/** null: el proyecto no tiene plan (fase 0) o no existe. Devuelve copias. */
export async function fetchTimingPlan(code: string): Promise<TimingPlan | null> {
  const plan = PLANS.find((p) => p.code === code);
  if (!plan) return null;
  return {
    ...plan,
    phases: plan.phases.map((f) => ({ ...f })),
    pauses: plan.pauses.map((p) => ({ ...p })),
    activePause: plan.activePause ? { ...plan.activePause } : null,
  };
}
