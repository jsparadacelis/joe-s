import { PHASES } from "@/lib/phases";
import { fetchProject, listProjects } from "@/lib/projects";
import {
  ALL_FILTER,
  STALE_AFTER_DAYS,
  STATUS_LABEL,
  fetchPortfolio,
  filterPortfolio,
  isStale,
  summarizePortfolio,
  type PortfolioRow,
  type PortfolioStatus,
} from "@/lib/portfolio";
import { TRAFFIC_LIGHT_LABEL, consumptionTrafficLight, fetchTimingPlan } from "@/lib/timing";

const TODAY = "2026-10-24";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

let counter = 0;
function row(extra: Partial<PortfolioRow> = {}): PortfolioRow {
  counter += 1;
  return {
    code: `PRY-EJ-9${String(counter).padStart(2, "0")}`,
    name: `Test project ${counter}`,
    phase: 3,
    status: "green",
    nextMilestone: { name: "Milestone", date: "2026-12-01" },
    owner: "Owner A",
    blocker: null,
    daysSinceUpdate: 1,
    ...extra,
  };
}

const withMilestone = (date: string | null) =>
  row({ nextMilestone: date === null ? null : { name: "Milestone", date } });

describe("constants and labels", () => {
  it("a sheet is stale after 7 days", () => {
    expect(STALE_AFTER_DAYS).toBe(7);
  });

  it("reuses the traffic-light labels and adds paused and no-plan", () => {
    expect(STATUS_LABEL.green).toBe(TRAFFIC_LIGHT_LABEL.green);
    expect(STATUS_LABEL.amber).toBe(TRAFFIC_LIGHT_LABEL.amber);
    expect(STATUS_LABEL.red).toBe(TRAFFIC_LIGHT_LABEL.red);
    expect(STATUS_LABEL.paused).toBe("En pausa");
    expect(STATUS_LABEL["no-plan"]).toBe("Sin plan");
  });

  it("the filter sentinel for «everything» is 'all'", () => {
    expect(ALL_FILTER).toBe("all");
  });
});

describe("isStale", () => {
  it.each([
    [0, false],
    [7, false],
    [8, true],
    [30, true],
  ])("%i days since update -> %s", (days, expected) => {
    expect(isStale(row({ daysSinceUpdate: days }))).toBe(expected);
  });
});

describe("summarizePortfolio", () => {
  it("empty portfolio: all zeros", () => {
    expect(summarizePortfolio([], TODAY)).toEqual({ active: 0, atRisk: 0, milestonesIn7Days: 0, staleSheets: 0 });
  });

  it("active counts every row of the portfolio, including paused and no-plan", () => {
    const rows = [row(), row({ status: "paused" }), row({ status: "no-plan", phase: 0, nextMilestone: null })];
    expect(summarizePortfolio(rows, TODAY).active).toBe(3);
  });

  it("at risk = amber or red only", () => {
    const statuses: PortfolioStatus[] = ["green", "amber", "red", "red", "paused", "no-plan"];
    const rows = statuses.map((status) => row({ status }));
    expect(summarizePortfolio(rows, TODAY).atRisk).toBe(3);
  });

  describe("milestones within 7 days", () => {
    it.each([
      ["today", "2026-10-24", 1],
      ["tomorrow", "2026-10-25", 1],
      ["day 7 (inclusive upper border)", "2026-10-31", 1],
      ["day 8 (outside)", "2026-11-01", 0],
      ["yesterday (past)", "2026-10-23", 0],
      ["long past", "2025-01-01", 0],
      ["far future", "2027-03-01", 0],
    ])("%s", (_label, date, expected) => {
      expect(summarizePortfolio([withMilestone(date)], TODAY).milestonesIn7Days).toBe(expected);
    });

    it("rows without a next milestone do not count", () => {
      expect(summarizePortfolio([withMilestone(null)], TODAY).milestonesIn7Days).toBe(0);
    });

    it("crosses a month and year boundary without using local time zones", () => {
      expect(summarizePortfolio([withMilestone("2027-01-03")], "2026-12-28").milestonesIn7Days).toBe(1);
      expect(summarizePortfolio([withMilestone("2027-01-05")], "2026-12-28").milestonesIn7Days).toBe(0);
    });

    it("counts several milestones", () => {
      const rows = [withMilestone("2026-10-24"), withMilestone("2026-10-30"), withMilestone("2026-11-20"), withMilestone(null)];
      expect(summarizePortfolio(rows, TODAY).milestonesIn7Days).toBe(2);
    });
  });

  describe("stale sheets", () => {
    it.each([
      [0, 0],
      [7, 0],
      [8, 1],
      [40, 1],
    ])("%i days since update -> %i stale", (days, expected) => {
      expect(summarizePortfolio([row({ daysSinceUpdate: days })], TODAY).staleSheets).toBe(expected);
    });
  });

  it("computes the four figures together", () => {
    const rows = [
      row({ status: "red", daysSinceUpdate: 10, nextMilestone: { name: "M", date: "2026-10-26" } }),
      row({ status: "amber", daysSinceUpdate: 2, nextMilestone: { name: "M", date: "2026-11-30" } }),
      row({ status: "green", daysSinceUpdate: 8, nextMilestone: null }),
      row({ status: "paused", daysSinceUpdate: 0 }),
    ];
    expect(summarizePortfolio(rows, TODAY)).toEqual({ active: 4, atRisk: 2, milestonesIn7Days: 1, staleSheets: 2 });
  });

  it("does not mutate the rows", () => {
    const rows = [row()];
    const copy = JSON.parse(JSON.stringify(rows));
    summarizePortfolio(rows, TODAY);
    expect(rows).toEqual(copy);
  });
});

describe("filterPortfolio", () => {
  const rows = [
    row({ code: "A", status: "green", owner: "Ana" }),
    row({ code: "B", status: "amber", owner: "Ana" }),
    row({ code: "C", status: "red", owner: "Beto" }),
    row({ code: "D", status: "paused", owner: "Beto" }),
    row({ code: "E", status: "no-plan", owner: "Carla", phase: 0, nextMilestone: null }),
  ];
  const codes = (result: readonly PortfolioRow[]) => result.map((r) => r.code);

  it("no filter (both 'all') returns every row in the same order", () => {
    expect(codes(filterPortfolio(rows, { status: ALL_FILTER, owner: ALL_FILTER }))).toEqual(["A", "B", "C", "D", "E"]);
  });

  it.each([
    ["green", ["A"]],
    ["amber", ["B"]],
    ["red", ["C"]],
    ["paused", ["D"]],
    ["no-plan", ["E"]],
  ] as const)("by status %s", (status, expected) => {
    expect(codes(filterPortfolio(rows, { status, owner: ALL_FILTER }))).toEqual(expected);
  });

  it("by owner", () => {
    expect(codes(filterPortfolio(rows, { status: ALL_FILTER, owner: "Ana" }))).toEqual(["A", "B"]);
    expect(codes(filterPortfolio(rows, { status: ALL_FILTER, owner: "Beto" }))).toEqual(["C", "D"]);
  });

  it("status and owner combine with AND", () => {
    expect(codes(filterPortfolio(rows, { status: "amber", owner: "Ana" }))).toEqual(["B"]);
    expect(codes(filterPortfolio(rows, { status: "red", owner: "Ana" }))).toEqual([]);
  });

  it("no matches returns an empty array", () => {
    expect(filterPortfolio(rows, { status: ALL_FILTER, owner: "Nobody" })).toEqual([]);
  });

  it("an empty portfolio stays empty", () => {
    expect(filterPortfolio([], { status: "green", owner: "Ana" })).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [...rows];
    filterPortfolio(input, { status: "green", owner: ALL_FILTER });
    expect(input).toEqual(rows);
  });
});

describe("fetchPortfolio (sample data)", () => {
  it("returns rows with the contract shape", async () => {
    const rows = await fetchPortfolio();
    expect(rows.length).toBeGreaterThanOrEqual(6);
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(
        ["blocker", "code", "daysSinceUpdate", "name", "nextMilestone", "owner", "phase", "status"],
      );
      expect(r.code).toMatch(/^PRY-EJ-\d{3}$/);
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.owner.length).toBeGreaterThan(0);
      expect(PHASES.map((p) => p.id)).toContain(r.phase);
      expect(["green", "amber", "red", "paused", "no-plan"]).toContain(r.status);
      expect(Number.isInteger(r.daysSinceUpdate)).toBe(true);
      expect(r.daysSinceUpdate).toBeGreaterThanOrEqual(0);
      expect(r.blocker === null || r.blocker.length > 0).toBe(true);
      if (r.nextMilestone) {
        expect(r.nextMilestone.name.length).toBeGreaterThan(0);
        expect(r.nextMilestone.date).toMatch(ISO);
        expect(new Date(r.nextMilestone.date).toISOString().startsWith(r.nextMilestone.date)).toBe(true);
      }
    }
  });

  it("codes are unique", async () => {
    const rows = await fetchPortfolio();
    expect(new Set(rows.map((r) => r.code)).size).toBe(rows.length);
  });

  it("includes the PRY-EJ projects of lib/projects.ts with the same name and phase", async () => {
    const [rows, projects] = await Promise.all([fetchPortfolio(), listProjects()]);
    for (const project of projects) {
      const match = rows.find((r) => r.code === project.code);
      expect(match).toBeDefined();
      expect(match?.name).toBe(project.name);
      expect(match?.phase).toBe(project.currentPhase);
    }
  });

  // RGB-11 fix F1: every portfolio link must resolve, so ALL rows (not just four) exist in lib/projects.ts.
  it("every portfolio row exists in lib/projects.ts with the same name and current phase", async () => {
    const rows = await fetchPortfolio();
    const listed = await listProjects();
    expect(listed.map((p) => p.code).sort()).toEqual(rows.map((r) => r.code).sort());
    for (const row of rows) {
      const project = await fetchProject(row.code);
      expect(project).not.toBeNull();
      expect(project?.name).toBe(row.name);
      expect(project?.currentPhase).toBe(row.phase);
    }
  });

  it("opportunities (phase 0) have the no-plan status and only they do", async () => {
    const rows = await fetchPortfolio();
    expect(rows.some((r) => r.phase === 0)).toBe(true);
    for (const r of rows) expect(r.status === "no-plan").toBe(r.phase === 0);
  });

  it("PRY-EJ-003 is paused, like its timing plan", async () => {
    const rows = await fetchPortfolio();
    expect(rows.find((r) => r.code === "PRY-EJ-003")?.status).toBe("paused");
  });

  it("covers every status, several owners, blockers, stale and fresh sheets", async () => {
    const rows = await fetchPortfolio();
    expect(new Set(rows.map((r) => r.status))).toEqual(new Set(["green", "amber", "red", "paused", "no-plan"]));
    expect(new Set(rows.map((r) => r.owner)).size).toBeGreaterThanOrEqual(2);
    expect(rows.some((r) => r.blocker !== null)).toBe(true);
    expect(rows.some((r) => isStale(r))).toBe(true);
    expect(rows.some((r) => !isStale(r))).toBe(true);
  });

  it("is fictitious: every name is marked as an example", async () => {
    const rows = await fetchPortfolio();
    for (const r of rows) expect(r.name).toMatch(/\(ejemplo\)/);
  });

  it("returns independent copies (mutating one result does not affect the next)", async () => {
    const first = await fetchPortfolio();
    first[0].name = "mutated";
    first.pop();
    const second = await fetchPortfolio();
    expect(second[0].name).not.toBe("mutated");
    expect(second).toHaveLength(first.length + 1);
  });
});

describe("portfolio traffic light is the one of the timing plan (RGB-11 B1)", () => {
  it("every green/amber/red row has the consumptionTrafficLight of the plan's current phase", async () => {
    const rows = await fetchPortfolio();
    const checked: string[] = [];
    for (const r of rows) {
      if (r.status !== "green" && r.status !== "amber" && r.status !== "red") continue;
      const plan = await fetchTimingPlan(r.code);
      expect(plan).not.toBeNull();
      const current = plan!.phases.find((p) => p.phase === plan!.currentPhase)!;
      expect({ code: r.code, phase: current.phase, status: r.status }).toEqual({
        code: r.code,
        phase: current.phase,
        status: consumptionTrafficLight(current.activeWeeks, current.plannedWeeks),
      });
      checked.push(r.code);
    }
    expect(checked.length).toBeGreaterThanOrEqual(3);
  });

  it("paused rows have an active pause in the plan, and only they", async () => {
    for (const r of await fetchPortfolio()) {
      const plan = await fetchTimingPlan(r.code);
      expect({ code: r.code, paused: r.status === "paused" }).toEqual({ code: r.code, paused: plan?.activePause != null });
    }
  });

  it("no-plan rows are exactly those without a timing plan (phase 0)", async () => {
    for (const r of await fetchPortfolio()) {
      const plan = await fetchTimingPlan(r.code);
      expect({ code: r.code, noPlan: r.status === "no-plan" }).toEqual({ code: r.code, noPlan: plan === null });
      expect({ code: r.code, phase0: r.phase === 0 }).toEqual({ code: r.code, phase0: plan === null });
    }
  });

  it("the next milestone of a paused row is the plan's expected resumption", async () => {
    const paused = (await fetchPortfolio()).filter((r) => r.status === "paused");
    expect(paused.length).toBeGreaterThanOrEqual(1);
    for (const r of paused) {
      const plan = await fetchTimingPlan(r.code);
      expect({ code: r.code, date: r.nextMilestone?.date }).toEqual({ code: r.code, date: plan!.activePause!.expectedResumption });
    }
  });

  it("the summary counts at-risk from the plan-derived lights and keeps every state represented", async () => {
    const rows = await fetchPortfolio();
    expect(new Set(rows.map((r) => r.status))).toEqual(new Set(["green", "amber", "red", "paused", "no-plan"]));
    const summary = summarizePortfolio(rows, TODAY);
    expect(summary.active).toBe(rows.length);
    // Phase lights from the plans: 001 amber (4/5), 004 green (1/3), 005 red, 006 amber (5/6).
    expect(summary.atRisk).toBe(3);
  });
});
