import type { PortfolioRow } from "@/lib/portfolio";

/**
 * RGB-13: the fictitious portfolio used to live in `lib/portfolio.ts` (sample data layer).
 * `fetchPortfolio` now reads `GET /api/portfolio`, so the sample rows only survive here, as test fixtures.
 * Reference date of the fixtures: 2026-10-24.
 */
export const SAMPLE_AS_OF = "2026-10-24";

export const SAMPLE_ROWS: readonly PortfolioRow[] = [
  {
    code: "PRY-EJ-001",
    name: "Vivienda unifamiliar (ejemplo)",
    phase: 3,
    status: "amber",
    nextMilestone: { name: "Entrega del anteproyecto", date: "2026-10-28" },
    owner: "Ana Ejemplo",
    blocker: null,
    daysSinceUpdate: 2,
    phaseWeeks: { active: 4, planned: 5 },
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
    phaseWeeks: null,
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
    phaseWeeks: { active: 30, planned: 36 },
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
    phaseWeeks: { active: 1, planned: 3 },
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
    phaseWeeks: { active: 9, planned: 8 },
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
    phaseWeeks: { active: 5, planned: 6 },
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
    phaseWeeks: null,
  },
];

/** One project as `GET /api/portfolio` returns it (snake_case, contract of RGB-13). */
export interface ApiPortfolioProject {
  code: string;
  name: string;
  phase: number;
  status: string;
  next_milestone: { name: string; date: string | null } | null;
  owner_id: string | null;
  owner_name: string | null;
  blocker: string | null;
  days_since_update: number;
  phase_weeks: { active: number; planned: number } | null;
}

/** Builds an API portfolio project; defaults to a freshly created opportunity. */
export function apiProject(extra: Partial<ApiPortfolioProject> = {}): ApiPortfolioProject {
  return {
    code: "PRY-2026-001",
    name: "Test opportunity",
    phase: 0,
    status: "no_plan",
    next_milestone: null,
    owner_id: "Ana Test",
    owner_name: null,
    blocker: null,
    days_since_update: 0,
    phase_weeks: null,
    ...extra,
  };
}

/** Converts front rows to the API shape (inverse of the mapping in `fetchPortfolio`). */
export function toApiPortfolio(rows: readonly PortfolioRow[], asOf = SAMPLE_AS_OF) {
  return {
    as_of: asOf,
    projects: rows.map((row) =>
      apiProject({
        code: row.code,
        name: row.name,
        phase: row.phase,
        status: row.status === "no-plan" ? "no_plan" : row.status,
        next_milestone: row.nextMilestone,
        owner_id: row.owner,
        owner_name: null,
        blocker: row.blocker,
        days_since_update: row.daysSinceUpdate,
        phase_weeks: row.phaseWeeks,
      }),
    ),
  };
}

/** A `request` stub that answers every call with `body`. */
export const requestReturning = (body: unknown) => jest.fn().mockResolvedValue(body);
