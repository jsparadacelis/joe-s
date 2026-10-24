import type { Portfolio, PortfolioRow } from "@/lib/portfolio";

/** Fictitious rows shared by the portfolio component tests. Reference date: 2026-10-24. */
export const TODAY = "2026-10-24";

export function makeRow(extra: Partial<PortfolioRow> = {}): PortfolioRow {
  // RGB-23: `phaseWeeks` is a required field. It is `null` if and only if the status is `no-plan`,
  // so a `no-plan` row built without an explicit value gets `null` (keeps the pre-RGB-23 tests valid).
  const phaseWeeks = extra.status === "no-plan" ? null : { active: 2, planned: 5 };
  return {
    code: "PRY-EJ-901",
    name: "Test project (ejemplo)",
    phase: 3,
    status: "green",
    nextMilestone: { name: "Preliminary design review", date: "2026-11-15" },
    owner: "Ana Test",
    blocker: null,
    daysSinceUpdate: 1,
    phaseWeeks,
    ...extra,
  };
}

/**
 * Summary of ROWS with TODAY: active 5, at risk 2 (R2 amber, R3 red),
 * milestones in 7 days 2 (R1 on day 2, R3 on day 7), stale 2 (R2 with 8 days, R4 with 9).
 */
export const ROWS: PortfolioRow[] = [
  makeRow({
    code: "PRY-EJ-901",
    name: "Alpha house (ejemplo)",
    phase: 3,
    status: "green",
    nextMilestone: { name: "Design review", date: "2026-10-26" },
    owner: "Ana Test",
    daysSinceUpdate: 1,
    phaseWeeks: { active: 2, planned: 5 }, // 40 %
  }),
  makeRow({
    code: "PRY-EJ-902",
    name: "Bravo shop (ejemplo)",
    phase: 4,
    status: "amber",
    nextMilestone: { name: "Permit filing", date: "2026-11-30" },
    owner: "Ana Test",
    blocker: "Waiting for the permit office",
    daysSinceUpdate: 8,
    phaseWeeks: { active: 5, planned: 6 }, // 83 %
  }),
  makeRow({
    code: "PRY-EJ-903",
    name: "Charlie offices (ejemplo)",
    phase: 6,
    status: "red",
    nextMilestone: { name: "Site handover", date: "2026-10-31" },
    owner: "Beto Test",
    daysSinceUpdate: 3,
    phaseWeeks: { active: 9, planned: 8 }, // 113 %
  }),
  makeRow({
    code: "PRY-EJ-904",
    name: "Delta warehouse (ejemplo)",
    phase: 2,
    status: "paused",
    nextMilestone: { name: "Concept approval", date: "2026-12-10" },
    owner: "Beto Test",
    blocker: "Client decision pending",
    daysSinceUpdate: 9,
    phaseWeeks: { active: 2, planned: 3 }, // frozen, 67 %
  }),
  makeRow({
    code: "PRY-EJ-905",
    name: "Echo renovation (ejemplo)",
    phase: 0,
    status: "no-plan",
    nextMilestone: null,
    owner: "Carla Test",
    daysSinceUpdate: 0,
    phaseWeeks: null,
  }),
];

/** What `fetchPortfolio` resolves with (RGB-13): rows plus the `as_of` reference date. */
export const portfolioOf = (rows: PortfolioRow[], asOf = TODAY): Portfolio => ({ asOf, rows });
