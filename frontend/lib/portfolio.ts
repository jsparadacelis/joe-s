/**
 * RGB-11 portfolio contract and SAMPLE (fictitious) data layer.
 * `fetchPortfolio` is replaced by the API client (`GET /api/portfolio`) once the backend
 * exposes it; the pure functions below stay in the front end as presentation logic.
 */
import type { PhaseId } from "@/lib/phases";
import { TRAFFIC_LIGHT_LABEL } from "@/lib/timing";

export type PortfolioStatus = "green" | "amber" | "red" | "paused" | "no-plan";

export interface PortfolioRow {
  code: string;
  name: string;
  phase: PhaseId;
  /** `no-plan` if and only if the project is an opportunity (phase 0). */
  status: PortfolioStatus;
  /** `date` is an ISO date (yyyy-mm-dd). */
  nextMilestone: { name: string; date: string } | null;
  owner: string;
  blocker: string | null;
  daysSinceUpdate: number;
}

export interface PortfolioSummary {
  active: number;
  atRisk: number;
  milestonesIn7Days: number;
  staleSheets: number;
}

export const STALE_AFTER_DAYS = 7;
const MILESTONE_WINDOW_DAYS = 7;
const MS_PER_DAY = 86_400_000;

/** Sentinel for «everything» in the filters. */
export const ALL_FILTER = "all";

export interface PortfolioFilter {
  status: PortfolioStatus | typeof ALL_FILTER;
  /** Owner name or `ALL_FILTER`. */
  owner: string;
}

export const STATUS_LABEL: Record<PortfolioStatus, string> = {
  ...TRAFFIC_LIGHT_LABEL,
  paused: "En pausa",
  "no-plan": "Sin plan",
};

export function isStale(row: PortfolioRow): boolean {
  return row.daysSinceUpdate > STALE_AFTER_DAYS;
}

/** Days from `from` to `to` (ISO dates), computed in UTC so time zones and DST do not matter. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);
}

export function summarizePortfolio(rows: readonly PortfolioRow[], today: string): PortfolioSummary {
  const dueSoon = (row: PortfolioRow) => {
    if (!row.nextMilestone) return false;
    const days = daysBetween(today, row.nextMilestone.date);
    return days >= 0 && days <= MILESTONE_WINDOW_DAYS;
  };
  return {
    active: rows.length,
    atRisk: rows.filter((row) => row.status === "amber" || row.status === "red").length,
    milestonesIn7Days: rows.filter(dueSoon).length,
    staleSheets: rows.filter(isStale).length,
  };
}

export function filterPortfolio(rows: readonly PortfolioRow[], filter: PortfolioFilter): PortfolioRow[] {
  return rows.filter(
    (row) =>
      (filter.status === ALL_FILTER || row.status === filter.status) &&
      (filter.owner === ALL_FILTER || row.owner === filter.owner),
  );
}

// ---- SAMPLE DATA (replaceable by the API client) ----

const ROWS: readonly PortfolioRow[] = [
  {
    code: "PRY-EJ-001",
    name: "Vivienda unifamiliar (ejemplo)",
    phase: 3,
    status: "amber",
    nextMilestone: { name: "Entrega del anteproyecto", date: "2026-10-28" },
    owner: "Ana Ejemplo",
    blocker: null,
    daysSinceUpdate: 2,
  },
  {
    code: "PRY-EJ-002",
    name: "Reforma de local comercial (ejemplo)",
    phase: 0,
    status: "no-plan",
    nextMilestone: null,
    owner: "Carla Ejemplo",
    blocker: null,
    daysSinceUpdate: 0,
  },
  {
    code: "PRY-EJ-003",
    name: "Edificio de oficinas (ejemplo)",
    phase: 6,
    status: "paused",
    nextMilestone: { name: "Reanudación de la obra", date: "2026-11-09" },
    owner: "Beto Ejemplo",
    blocker: "Espera de la licencia de primera ocupación",
    daysSinceUpdate: 9,
  },
  {
    code: "PRY-EJ-004",
    name: "Local comercial (ejemplo)",
    phase: 2,
    status: "green",
    nextMilestone: { name: "Aprobación del brief", date: "2026-11-04" },
    owner: "Ana Ejemplo",
    blocker: "Falta el levantamiento topográfico",
    daysSinceUpdate: 5,
  },
  {
    code: "PRY-EJ-005",
    name: "Rehabilitación de fachada (ejemplo)",
    phase: 5,
    status: "red",
    nextMilestone: { name: "Visado del proyecto de ejecución", date: "2026-10-30" },
    owner: "Beto Ejemplo",
    blocker: null,
    daysSinceUpdate: 12,
  },
  {
    code: "PRY-EJ-006",
    name: "Nave logística (ejemplo)",
    phase: 4,
    status: "amber",
    nextMilestone: { name: "Presentación de la licencia", date: "2026-12-10" },
    owner: "Carla Ejemplo",
    blocker: null,
    daysSinceUpdate: 1,
  },
  {
    code: "PRY-EJ-007",
    name: "Residencia de mayores (ejemplo)",
    phase: 0,
    status: "no-plan",
    nextMilestone: null,
    owner: "Ana Ejemplo",
    blocker: null,
    daysSinceUpdate: 3,
  },
];

export async function fetchPortfolio(): Promise<PortfolioRow[]> {
  return ROWS.map((row) => ({ ...row, nextMilestone: row.nextMilestone && { ...row.nextMilestone } }));
}
