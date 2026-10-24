/**
 * RGB-22 timing contract and SAMPLE (fictitious) data layer.
 * The timing service (RGB-20/21) calculates active weeks, pause, totals,
 * calendar and deviation; the front end shows them as they are and only derives the
 * consumption percentage and the traffic light (presentation logic).
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

/** ISO dates yyyy-mm-dd. */
export interface Pause {
  from: string;
  to: string | null;
  phase: PlannedPhase;
  reason: PauseReason;
  weeks: number;
}

export interface ActivePause {
  from: string;
  reason: PauseReason;
  expectedResumption: string;
}

export interface TimingPlan {
  code: string;
  currentPhase: PlannedPhase;
  /** Always 7 entries, phases 1..7 in order. */
  phases: PhaseTiming[];
  /** History, from most recent to oldest. */
  pauses: Pause[];
  activePause: ActivePause | null;
  totalActiveWeeks: number;
  totalPlannedWeeks: number;
  totalPausedWeeks: number;
  calendarWeeks: number;
  /** Active against accumulated plan; positive = delay. */
  deviationWeeks: number;
}

export type TrafficLight = "green" | "amber" | "red";

export const TRAFFIC_LIGHT_LABEL: Record<TrafficLight, string> = {
  green: "En plazo",
  amber: "Atención",
  red: "Plan superado",
};

/** Whole consumption percentage (no upper limit). Plan <= 0 returns 0. */
export function consumptionPercent(active: number, plan: number): number {
  if (plan <= 0) return 0;
  return Math.round((active / plan) * 100);
}

/**
 * Single source of truth for the traffic light. Decides with the real value (integers, no
 * rounding): red if active > plan; amber from 80 % (active/plan >= 4/5).
 */
export function consumptionTrafficLight(active: number, plan: number): TrafficLight {
  if (plan <= 0) return "green";
  if (active > plan) return "red";
  return active * 5 >= plan * 4 ? "amber" : "green";
}

/** ISO date yyyy-mm-dd to dd/mm/aaaa, without going through Date (no time zones). */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

// ---- SAMPLE DATA (replaceable by the API client) ----

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
      { from: "2026-08-03", to: "2026-08-10", phase: 3, reason: "client-wait", weeks: 1 },
      { from: "2026-05-04", to: "2026-05-25", phase: 2, reason: "internal-decision", weeks: 3 },
    ],
    activePause: null,
    totalActiveWeeks: 11,
    totalPlannedWeeks: 64,
    totalPausedWeeks: 4,
    calendarWeeks: 15,
    deviationWeeks: 1,
  },
  {
    code: "PRY-EJ-003",
    currentPhase: 6,
    phases: samplePhases([2, 3, 5, 6, 8, 30, 0], [0, 0, 0, 1, 0, 2, 0]),
    pauses: [
      { from: "2026-10-12", to: null, phase: 6, reason: "authority-wait", weeks: 2 },
      { from: "2026-03-02", to: "2026-03-09", phase: 4, reason: "client-wait", weeks: 1 },
    ],
    activePause: { from: "2026-10-12", reason: "authority-wait", expectedResumption: "2026-11-09" },
    totalActiveWeeks: 54,
    totalPlannedWeeks: 64,
    totalPausedWeeks: 3,
    calendarWeeks: 57,
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
    calendarWeeks: 3,
    deviationWeeks: 0,
  },
  {
    code: "PRY-EJ-005",
    currentPhase: 5,
    phases: samplePhases([2, 3, 5, 6, 9, 0, 0], [0, 0, 0, 0, 0, 0, 0]),
    pauses: [],
    activePause: null,
    totalActiveWeeks: 25,
    totalPlannedWeeks: 64,
    totalPausedWeeks: 0,
    calendarWeeks: 25,
    deviationWeeks: 1,
  },
  {
    code: "PRY-EJ-006",
    currentPhase: 4,
    phases: samplePhases([2, 3, 5, 5, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]),
    pauses: [],
    activePause: null,
    totalActiveWeeks: 15,
    totalPlannedWeeks: 64,
    totalPausedWeeks: 0,
    calendarWeeks: 15,
    deviationWeeks: -1,
  },
];

// ---- Public function (same signature as the API client) ----

/** null: the project has no plan (phase 0) or does not exist. Returns copies. */
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
