import { PHASES } from "@/lib/phases";
import { ApiError } from "@/lib/api";
import {
  ALL_FILTER,
  STALE_AFTER_DAYS,
  STATUS_LABEL,
  fetchPortfolio,
  filterPortfolio,
  isStale,
  phaseWeeksProgress,
  summarizePortfolio,
  type PortfolioRow,
  type PortfolioStatus,
} from "@/lib/portfolio";
import { TRAFFIC_LIGHT_LABEL, consumptionPercent, consumptionTrafficLight } from "@/lib/timing";
import { SAMPLE_AS_OF, SAMPLE_ROWS, apiProject, requestReturning, toApiPortfolio } from "../helpers/portfolio-sample";

const TODAY = "2026-10-24";

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
    // RGB-23: required field; null if and only if the status is no-plan.
    phaseWeeks: extra.status === "no-plan" ? null : { active: 1, planned: 5 },
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

// RGB-13: `fetchPortfolio` reads `GET /api/portfolio` and maps snake_case to the front contract.
// Replaces the former "sample data" tests (contract shape, PRY-EJ coherence with lib/projects.ts and
// lib/timing.ts, RGB-11 B1 and RGB-23 invariants). Those checked that hand-written fixtures agreed with
// each other; with real data the status, weeks and milestones come from the API, so the cases that still
// matter (shape, status mapping, nulls, summary reference date, independence of the result) are below.
describe("fetchPortfolio (API)", () => {
  it("calls GET /api/portfolio", async () => {
    const request = requestReturning({ as_of: TODAY, projects: [] });
    await fetchPortfolio(request);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("/api/portfolio");
  });

  it("maps a project to the front contract (camelCase, exact keys) and exposes as_of as asOf", async () => {
    const api = apiProject({
      code: "PRY-2026-014",
      name: "Test house",
      phase: 3,
      status: "amber",
      next_milestone: { name: "Design review", date: "2026-10-28" },
      owner_id: "Ana Test",
      blocker: "Waiting for survey",
      days_since_update: 4,
      phase_weeks: { active: 4, planned: 5 },
    });
    const result = await fetchPortfolio(requestReturning({ as_of: "2026-10-24", projects: [api] }));
    expect(result.asOf).toBe("2026-10-24");
    expect(result.rows).toEqual([
      {
        code: "PRY-2026-014",
        name: "Test house",
        phase: 3,
        status: "amber",
        nextMilestone: { name: "Design review", date: "2026-10-28" },
        owner: "Ana Test",
        blocker: "Waiting for survey",
        daysSinceUpdate: 4,
        phaseWeeks: { active: 4, planned: 5 },
      },
    ]);
    expect(Object.keys(result.rows[0]).sort()).toEqual(
      ["blocker", "code", "daysSinceUpdate", "name", "nextMilestone", "owner", "phase", "phaseWeeks", "status"],
    );
  });

  it.each([
    ["no_plan", "no-plan"],
    ["paused", "paused"],
    ["green", "green"],
    ["amber", "amber"],
    ["red", "red"],
    ["unknown", "unknown"],
  ])("status %s becomes %s", async (apiStatus, expected) => {
    const result = await fetchPortfolio(requestReturning({ as_of: TODAY, projects: [apiProject({ status: apiStatus })] }));
    expect(result.rows[0].status).toBe(expected);
  });

  it("an unrecognised status degrades to unknown instead of breaking the table", async () => {
    const result = await fetchPortfolio(requestReturning({ as_of: TODAY, projects: [apiProject({ status: "mystery" })] }));
    expect(result.rows[0].status).toBe("unknown");
  });

  it("a milestone with a null date keeps its name and a null date; no milestone stays null", async () => {
    const result = await fetchPortfolio(
      requestReturning({
        as_of: TODAY,
        projects: [
          apiProject({ code: "A", next_milestone: { name: "Kick-off", date: null } }),
          apiProject({ code: "B", next_milestone: null }),
        ],
      }),
    );
    expect(result.rows[0].nextMilestone).toEqual({ name: "Kick-off", date: null });
    expect(result.rows[1].nextMilestone).toBeNull();
  });

  it.each([
    ["owner_name wins over owner_id", "Ana Real", "user-1", "Ana Real"],
    ["owner_id when there is no owner_name", null, "Ana Test", "Ana Test"],
    ["«Sin responsable» when neither exists", null, null, "Sin responsable"],
    ["«Sin responsable» when both are blank", "  ", "", "Sin responsable"],
  ])("owner: %s", async (_label, ownerName, ownerId, expected) => {
    const result = await fetchPortfolio(
      requestReturning({ as_of: TODAY, projects: [apiProject({ owner_name: ownerName, owner_id: ownerId })] }),
    );
    expect(result.rows[0].owner).toBe(expected);
  });

  it("phaseWeeks maps active/planned and may be null in any status", async () => {
    const result = await fetchPortfolio(
      requestReturning({
        as_of: TODAY,
        projects: [
          apiProject({ code: "A", phase: 2, status: "green", phase_weeks: { active: 1, planned: 3 } }),
          apiProject({ code: "B", phase: 2, status: "unknown", phase_weeks: null }),
          apiProject({ code: "C", phase: 0, status: "no_plan", phase_weeks: null }),
        ],
      }),
    );
    expect(result.rows.map((r) => r.phaseWeeks)).toEqual([{ active: 1, planned: 3 }, null, null]);
  });

  it("keeps the API order and an empty portfolio is valid", async () => {
    const some = await fetchPortfolio(
      requestReturning({ as_of: TODAY, projects: [apiProject({ code: "PRY-2026-002" }), apiProject({ code: "PRY-2026-001" })] }),
    );
    expect(some.rows.map((r) => r.code)).toEqual(["PRY-2026-002", "PRY-2026-001"]);
    expect((await fetchPortfolio(requestReturning({ as_of: TODAY, projects: [] }))).rows).toEqual([]);
  });

  it("propagates API errors so the view can show them", async () => {
    const failure = new ApiError(0, "network_error", "No se pudo conectar con el servidor.");
    await expect(fetchPortfolio(jest.fn().mockRejectedValue(failure))).rejects.toBe(failure);
  });

  it("the default request goes through lib/api (global fetch, GET /api/portfolio)", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ as_of: TODAY, projects: [apiProject()] }),
    });
    const original = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const result = await fetchPortfolio();
      expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/portfolio$/);
      expect(result.rows[0].status).toBe("no-plan");
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("«Sin calcular» (status unknown, RGB-13)", () => {
  it("has the label «Sin calcular» and is listed in STATUS_LABEL", () => {
    expect(STATUS_LABEL.unknown).toBe("Sin calcular");
  });

  it("is not at risk", () => {
    expect(summarizePortfolio([row({ status: "unknown" })], TODAY).atRisk).toBe(0);
  });

  it("filters by unknown", () => {
    const rows = [row({ code: "A", status: "unknown" }), row({ code: "B", status: "green" })];
    expect(filterPortfolio(rows, { status: "unknown", owner: ALL_FILTER }).map((r) => r.code)).toEqual(["A"]);
  });

  it("a milestone without a date does not count in «Hitos en 7 días» and does not break the summary", () => {
    const rows = [row({ nextMilestone: { name: "Kick-off", date: null } })];
    expect(summarizePortfolio(rows, TODAY).milestonesIn7Days).toBe(0);
  });
});

// RGB-13: the sample rows are now fixtures; this guards that they stay valid inputs for the component tests.
describe("sample fixtures", () => {
  it("cover every status except unknown, with unique codes and valid phases", () => {
    expect(new Set(SAMPLE_ROWS.map((r) => r.status))).toEqual(new Set(["green", "amber", "red", "paused", "no-plan"]));
    expect(new Set(SAMPLE_ROWS.map((r) => r.code)).size).toBe(SAMPLE_ROWS.length);
    for (const r of SAMPLE_ROWS) expect(PHASES.map((p) => p.id)).toContain(r.phase);
  });

  it("round-trip through the API shape and fetchPortfolio", async () => {
    const result = await fetchPortfolio(requestReturning(toApiPortfolio(SAMPLE_ROWS)));
    expect(result.rows).toEqual(SAMPLE_ROWS);
    expect(result.asOf).toBe(SAMPLE_AS_OF);
  });
});

describe("phaseWeeksProgress", () => {
  const weeks = (active: number, planned: number) => row({ phaseWeeks: { active, planned } });

  it("returns null when the row has no phase weeks (opportunity)", () => {
    expect(phaseWeeksProgress(row({ status: "no-plan", phase: 0 }))).toBeNull();
  });

  it.each([
    [1, 3, 33, "green"],
    [3, 5, 60, "green"],
    [4, 5, 80, "amber"],
    [5, 6, 83, "amber"],
    [5, 5, 100, "amber"],
    [9, 8, 113, "red"],
    [0, 4, 0, "green"],
  ] as const)("%i of %i weeks -> %i %% and %s", (active, planned, percent, trafficLight) => {
    expect(phaseWeeksProgress(weeks(active, planned))).toEqual({ percent, trafficLight });
  });

  it("is exactly consumptionPercent and consumptionTrafficLight (single source of truth)", () => {
    for (const [active, planned] of [[1, 3], [4, 5], [30, 36], [9, 8], [0, 2]]) {
      expect(phaseWeeksProgress(weeks(active, planned))).toEqual({
        percent: consumptionPercent(active, planned),
        trafficLight: consumptionTrafficLight(active, planned),
      });
    }
  });

  it("does not depend on the row status: a paused row still reports its frozen weeks", () => {
    const paused = row({ status: "paused", phaseWeeks: { active: 30, planned: 36 } });
    expect(phaseWeeksProgress(paused)).toEqual({ percent: 83, trafficLight: "amber" });
  });

  it("the percent is not capped at 100", () => {
    expect(phaseWeeksProgress(weeks(12, 8))?.percent).toBe(150);
  });

  it("does not mutate the row", () => {
    const r = weeks(4, 5);
    const copy = JSON.parse(JSON.stringify(r));
    phaseWeeksProgress(r);
    expect(r).toEqual(copy);
  });
});
