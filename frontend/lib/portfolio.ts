/**
 * Portfolio (RGB-11) read from the API (RGB-13): `fetchPortfolio` calls `GET /api/portfolio` and maps
 * snake_case to the row contract below; the pure functions stay in the front end as presentation logic.
 * The former sample rows live on only as test fixtures (`__tests__/helpers/portfolio-sample.ts`).
 */
import { request as defaultRequest, type ApiRequest } from "@/lib/api";
import type { PhaseId } from "@/lib/phases";
import { TRAFFIC_LIGHT_LABEL, consumptionPercent, consumptionTrafficLight, type TrafficLight } from "@/lib/timing";

/** `unknown` («Sin calcular»): the API has no traffic light for a project that is neither phase 0 nor paused. */
export type PortfolioStatus = "green" | "amber" | "red" | "paused" | "no-plan" | "unknown";

export interface PortfolioRow {
  code: string;
  name: string;
  phase: PhaseId;
  /** `no-plan` if and only if the project is an opportunity (phase 0). */
  status: PortfolioStatus;
  /** `date` is an ISO date (yyyy-mm-dd), or `null` when the milestone has no date yet. */
  nextMilestone: { name: string; date: string | null } | null;
  owner: string;
  blocker: string | null;
  daysSinceUpdate: number;
  /**
   * Active and planned weeks of the CURRENT phase (same as `PhaseTiming` in lib/timing.ts).
   * `null` when the API has no plan weeks: always for `no-plan`, and for any other status until the
   * plan is calculated (RGB-16/21). Paused rows keep their frozen weeks when there are any.
   */
  phaseWeeks: { active: number; planned: number } | null;
}

/** What the view needs: the rows and the reference date (`as_of`, UTC) of the API. */
export interface Portfolio {
  asOf: string;
  rows: PortfolioRow[];
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
  unknown: "Sin calcular",
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
    if (!row.nextMilestone?.date) return false;
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

/** Consumption of the current phase; `null` without a plan. Independent of `status`; percent is not capped. */
export function phaseWeeksProgress(
  row: Pick<PortfolioRow, "phaseWeeks">,
): { percent: number; trafficLight: TrafficLight } | null {
  if (!row.phaseWeeks) return null;
  const { active, planned } = row.phaseWeeks;
  return { percent: consumptionPercent(active, planned), trafficLight: consumptionTrafficLight(active, planned) };
}

export function filterPortfolio(rows: readonly PortfolioRow[], filter: PortfolioFilter): PortfolioRow[] {
  return rows.filter(
    (row) =>
      (filter.status === ALL_FILTER || row.status === filter.status) &&
      (filter.owner === ALL_FILTER || row.owner === filter.owner),
  );
}

// ---- API (GET /api/portfolio) ----

interface ApiPortfolioProject {
  code: string;
  name: string;
  phase: PhaseId;
  status: string;
  next_milestone: { name: string; date: string | null } | null;
  owner_id: string | null;
  owner_name: string | null;
  blocker: string | null;
  days_since_update: number;
  phase_weeks: { active: number; planned: number } | null;
}

interface ApiPortfolio {
  as_of: string;
  projects: ApiPortfolioProject[];
}

export const NO_OWNER_LABEL = "Sin responsable";

const API_STATUS: Record<string, PortfolioStatus> = {
  no_plan: "no-plan",
  paused: "paused",
  green: "green",
  amber: "amber",
  red: "red",
  unknown: "unknown",
};

const firstText = (...values: (string | null | undefined)[]) => values.find((v) => v != null && v.trim() !== "");

function toRow(project: ApiPortfolioProject): PortfolioRow {
  return {
    code: project.code,
    name: project.name,
    phase: project.phase,
    // A status this client does not know is shown as «Sin calcular» rather than breaking the table.
    status: API_STATUS[project.status] ?? "unknown",
    nextMilestone: project.next_milestone && { name: project.next_milestone.name, date: project.next_milestone.date },
    owner: firstText(project.owner_name, project.owner_id) ?? NO_OWNER_LABEL,
    blocker: project.blocker,
    daysSinceUpdate: project.days_since_update,
    phaseWeeks: project.phase_weeks && { active: project.phase_weeks.active, planned: project.phase_weeks.planned },
  };
}

export async function fetchPortfolio(request: ApiRequest = defaultRequest): Promise<Portfolio> {
  const { as_of, projects } = await request<ApiPortfolio>("/api/portfolio");
  return { asOf: as_of, rows: projects.map(toRow) };
}
