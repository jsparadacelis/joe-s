import { PHASES } from "@/lib/phases";
import {
  REASON_LABEL,
  TRAFFIC_LIGHT_LABEL,
  fetchTimingPlan,
  consumptionPercent,
  consumptionTrafficLight,
  type PauseReason,
  type TrafficLight,
} from "@/lib/timing";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s);

describe("consumptionPercent", () => {
  it.each([
    [0, 5, 0],
    [1, 5, 20],
    [4, 5, 80],
    [5, 5, 100],
    [6, 5, 120],
    [3, 2, 150],
    [1, 3, 33],
    [2, 3, 67],
    [29, 36, 81],
    [30, 36, 83],
    [4, 3, 133],
  ])("%i active of %i planned = %i %%", (active, plan, expected) => {
    expect(consumptionPercent(active, plan)).toBe(expected);
  });

  it("rounds to the nearest integer (0.5 goes up)", () => {
    expect(consumptionPercent(1, 8)).toBe(13); // 12.5
    expect(consumptionPercent(1, 6)).toBe(17); // 16.67
    expect(consumptionPercent(1, 7)).toBe(14); // 14.28
  });

  it("plan 0 or negative returns 0 (no division by zero)", () => {
    expect(consumptionPercent(3, 0)).toBe(0);
    expect(consumptionPercent(0, 0)).toBe(0);
    expect(consumptionPercent(3, -2)).toBe(0);
    expect(Number.isFinite(consumptionPercent(5, 0))).toBe(true);
  });

  it("does not cap at 100 %", () => {
    expect(consumptionPercent(10, 2)).toBe(500);
  });
});

describe("consumptionTrafficLight: boundaries", () => {
  it.each<[string, number, number, TrafficLight]>([
    ["plan 5: 3 activas = 60 %", 3, 5, "green"],
    ["plan 5: 4 activas = 80 % exacto", 4, 5, "amber"],
    ["plan 5: 5 activas = 100 % (igual al plan)", 5, 5, "amber"],
    ["plan 5: 6 activas = 120 %", 6, 5, "red"],
    ["plan 10: 7 activas = 70 %", 7, 10, "green"],
    ["plan 10: 8 activas = 80 % exacto", 8, 10, "amber"],
    ["plan 10: 9 activas = 90 %", 9, 10, "amber"],
    ["plan 10: 10 activas = 100 %", 10, 10, "amber"],
    ["plan 10: 11 activas = 110 %", 11, 10, "red"],
    ["plan 36: 28 activas = 77,8 %", 28, 36, "green"],
    ["plan 36: 29 activas = 80,6 %", 29, 36, "amber"],
    ["plan 36: 35 activas = 97 %", 35, 36, "amber"],
    ["plan 36: 36 activas = 100 %", 36, 36, "amber"],
    ["plan 36: 37 activas = 102,8 %", 37, 36, "red"],
    ["plan 3: 2 activas = 66,7 %", 2, 3, "green"],
    ["plan 2: 1 activa = 50 %", 1, 2, "green"],
    ["plan 2: 2 activas = 100 %", 2, 2, "amber"],
    ["plan 2: 3 activas = 150 %", 3, 2, "red"],
    ["future phase: 0 active with plan", 0, 6, "green"],
    ["plan 0 sin activas", 0, 0, "green"],
    ["plan 0 con activas", 3, 0, "green"],
    ["plan negativo", 2, -1, "green"],
  ])("%s", (_n, active, plan, expected) => {
    expect(consumptionTrafficLight(active, plan)).toBe(expected);
  });

  it("79 % is green, 80 % is amber and 101 % is red (plan 100 to see the exact percentage)", () => {
    expect(consumptionTrafficLight(79, 100)).toBe("green");
    expect(consumptionTrafficLight(80, 100)).toBe("amber");
    expect(consumptionTrafficLight(99, 100)).toBe("amber");
    expect(consumptionTrafficLight(100, 100)).toBe("amber");
    expect(consumptionTrafficLight(101, 100)).toBe("red");
  });

  it("red is decided with the real value, not the rounded percentage (100.4 % is still red)", () => {
    // 501/500 = 100.2 % rounds to 100 %, but exceeds the plan
    expect(consumptionPercent(501, 500)).toBe(100);
    expect(consumptionTrafficLight(501, 500)).toBe("red");
  });

  it("amber is decided with the real value (79.6 % rounds to 80 % but is still green)", () => {
    // 199/250 = 79.6 %
    expect(consumptionPercent(199, 250)).toBe(80);
    expect(consumptionTrafficLight(199, 250)).toBe("green");
  });
});

describe("labels", () => {
  it("TRAFFIC_LIGHT_LABEL has the exact texts", () => {
    expect(TRAFFIC_LIGHT_LABEL).toEqual({ green: "En plazo", amber: "Atención", red: "Plan superado" });
  });

  it("REASON_LABEL has the exact texts", () => {
    const expected: Record<PauseReason, string> = {
      "client-wait": "Espera del cliente",
      "authority-wait": "Espera de organismo",
      "internal-decision": "Decisión interna",
      other: "Otra",
    };
    expect(REASON_LABEL).toEqual(expected);
  });
});

describe("fetchTimingPlan", () => {
  it("PRY-EJ-001: seven phases 1..7 in order with plan, active and pause from the task plan", async () => {
    const p = await fetchTimingPlan("PRY-EJ-001");
    expect(p).not.toBeNull();
    expect(p!.code).toBe("PRY-EJ-001");
    expect(p!.currentPhase).toBe(3);
    expect(p!.phases.map((f) => f.phase)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(p!.phases.map((f) => f.plannedWeeks)).toEqual([2, 3, 5, 6, 8, 36, 4]);
    expect(p!.phases.map((f) => f.activeWeeks)).toEqual([3, 4, 4, 0, 0, 0, 0]);
    expect(p!.phases.map((f) => f.pausedWeeks)).toEqual([0, 3, 1, 0, 0, 0, 0]);
  });

  it("PRY-EJ-001: service totals (11 active, 64 planned, 4 paused, 15 calendar, +1 deviation)", async () => {
    const p = (await fetchTimingPlan("PRY-EJ-001"))!;
    expect(p.totalActiveWeeks).toBe(11);
    expect(p.totalPlannedWeeks).toBe(64);
    expect(p.totalPausedWeeks).toBe(4);
    expect(p.calendarWeeks).toBe(15);
    expect(p.deviationWeeks).toBe(1);
  });

  it("PRY-EJ-001: no active pause and 2 pauses in the history", async () => {
    const p = (await fetchTimingPlan("PRY-EJ-001"))!;
    expect(p.activePause).toBeNull();
    expect(p.pauses).toHaveLength(2);
  });

  it("PRY-EJ-001: the weeks of the history pauses add up to the paused weeks", async () => {
    const p = (await fetchTimingPlan("PRY-EJ-001"))!;
    expect(p.pauses.reduce((s, x) => s + x.weeks, 0)).toBe(p.totalPausedWeeks);
  });

  it("PRY-EJ-002 (phase 0) has no plan: null", async () => {
    expect(await fetchTimingPlan("PRY-EJ-002")).toBeNull();
  });

  it("PRY-EJ-003: phase 6 with plan, active and pause from the task plan", async () => {
    const p = (await fetchTimingPlan("PRY-EJ-003"))!;
    expect(p).not.toBeNull();
    expect(p.code).toBe("PRY-EJ-003");
    expect(p.currentPhase).toBe(6);
    expect(p.phases.map((f) => f.phase)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(p.phases.map((f) => f.plannedWeeks)).toEqual([2, 3, 5, 6, 8, 36, 4]);
    expect(p.phases.map((f) => f.activeWeeks)).toEqual([2, 3, 5, 6, 8, 30, 0]);
    expect(p.phases.map((f) => f.pausedWeeks)).toEqual([0, 0, 0, 1, 0, 2, 0]);
  });

  it("PRY-EJ-003: has an active pause waiting for an authority with a resumption after the start", async () => {
    const p = (await fetchTimingPlan("PRY-EJ-003"))!;
    expect(p.activePause).not.toBeNull();
    expect(p.activePause!.reason).toBe("authority-wait");
    expect(isIsoDate(p.activePause!.from)).toBe(true);
    expect(isIsoDate(p.activePause!.expectedResumption)).toBe(true);
    expect(p.activePause!.expectedResumption > p.activePause!.from).toBe(true);
  });

  it.each(["PRY-NO-EXISTE", "", "pry-ej-001"])("nonexistent code %j returns null", async (c) => {
    expect(await fetchTimingPlan(c)).toBeNull();
  });

  it("returns copies: mutating the result does not alter the next query", async () => {
    const a = (await fetchTimingPlan("PRY-EJ-001"))!;
    a.phases[0].activeWeeks = 999;
    a.pauses.pop();
    a.totalActiveWeeks = 999;
    const b = (await fetchTimingPlan("PRY-EJ-001"))!;
    expect(b.phases[0].activeWeeks).toBe(3);
    expect(b.pauses).toHaveLength(2);
    expect(b.totalActiveWeeks).toBe(11);
  });
});

describe("consistency of the sample data", () => {
  const codes = ["PRY-EJ-001", "PRY-EJ-003", "PRY-EJ-004"];

  it.each(codes)("%s: unique, ordered phase ids with a name in PHASES", async (c) => {
    const p = (await fetchTimingPlan(c))!;
    const ids = p.phases.map((f) => f.phase);
    expect(new Set(ids).size).toBe(7);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    for (const id of ids) expect(PHASES[id].name.length).toBeGreaterThan(0);
    expect(ids).not.toContain(0);
  });

  it.each(codes)("%s: whole, non-negative weeks, positive plan", async (c) => {
    const p = (await fetchTimingPlan(c))!;
    for (const f of p.phases) {
      expect(Number.isInteger(f.plannedWeeks) && f.plannedWeeks > 0).toBe(true);
      expect(Number.isInteger(f.activeWeeks) && f.activeWeeks >= 0).toBe(true);
      expect(Number.isInteger(f.pausedWeeks) && f.pausedWeeks >= 0).toBe(true);
    }
  });

  it.each(codes)("%s: valid ISO dates and history from most recent to oldest", async (c) => {
    const p = (await fetchTimingPlan(c))!;
    for (const x of p.pauses) {
      expect(isIsoDate(x.from)).toBe(true);
      if (x.to !== null) {
        expect(isIsoDate(x.to)).toBe(true);
        expect(x.to >= x.from).toBe(true);
      }
      expect(x.weeks).toBeGreaterThanOrEqual(0);
      expect(Object.keys(REASON_LABEL)).toContain(x.reason);
      expect([1, 2, 3, 4, 5, 6, 7]).toContain(x.phase);
    }
    const froms = p.pauses.map((x) => x.from);
    expect(froms).toEqual([...froms].sort().reverse());
  });

  it.each(codes)("%s: fictitious data (PRY-EJ-NNN code, no emails or phone numbers)", async (c) => {
    const p = (await fetchTimingPlan(c))!;
    expect(p.code).toMatch(/^PRY-EJ-\d{3}$/);
    expect(JSON.stringify(p)).not.toMatch(/@|\b\d{9}\b/);
  });
});

describe("fetchTimingPlan · PRY-EJ-004 (RGB-29)", () => {
  it("has a seven-phase plan 1..7 with current phase 2", async () => {
    const p = (await fetchTimingPlan("PRY-EJ-004"))!;
    expect(p).not.toBeNull();
    expect(p.code).toBe("PRY-EJ-004");
    expect(p.currentPhase).toBe(2);
    expect(p.phases.map((f) => f.phase)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(p.phases.map((f) => f.plannedWeeks)).toEqual([2, 3, 5, 6, 8, 36, 4]);
  });

  it("there are active weeks only in the phases up to the current one", async () => {
    const p = (await fetchTimingPlan("PRY-EJ-004"))!;
    for (const f of p.phases.filter((x) => x.phase > p.currentPhase)) {
      expect(f.activeWeeks).toBe(0);
      expect(f.pausedWeeks).toBe(0);
    }
    expect(p.phases[0].activeWeeks).toBeGreaterThan(0);
  });

  it("totals match the sum of the phases and the calendar is active + pause", async () => {
    const p = (await fetchTimingPlan("PRY-EJ-004"))!;
    const sum = (k: "plannedWeeks" | "activeWeeks" | "pausedWeeks") => p.phases.reduce((a, f) => a + f[k], 0);
    expect(p.totalPlannedWeeks).toBe(sum("plannedWeeks"));
    expect(p.totalActiveWeeks).toBe(sum("activeWeeks"));
    expect(p.totalPausedWeeks).toBe(sum("pausedWeeks"));
    expect(p.calendarWeeks).toBe(p.totalActiveWeeks + p.totalPausedWeeks);
    expect(Number.isInteger(p.deviationWeeks)).toBe(true);
  });

  it("the weeks of the pause history add up to the paused ones and there is no inconsistent active pause", async () => {
    const p = (await fetchTimingPlan("PRY-EJ-004"))!;
    expect(p.pauses.reduce((a, x) => a + x.weeks, 0)).toBe(p.totalPausedWeeks);
    if (p.activePause) expect(p.pauses.some((x) => x.to === null)).toBe(true);
    else expect(p.pauses.every((x) => x.to !== null)).toBe(true);
  });
});

// RGB-11 fix F1: the project tabs link every portfolio project to «Plan y tiempos».
// Decision (simplest, consistent with the sample data): projects past phase 0 get a sample plan,
// phase 0 projects have none (null → «Sin plan hasta promover»).
describe("fetchTimingPlan for every portfolio project", () => {
  it.each([
    ["PRY-EJ-005", 5],
    ["PRY-EJ-006", 4],
  ] as const)("%s has a plan in its current phase %i", async (code, phase) => {
    const plan = await fetchTimingPlan(code);
    expect(plan).not.toBeNull();
    expect(plan?.code).toBe(code);
    expect(plan?.currentPhase).toBe(phase);
    expect(plan?.phases).toHaveLength(7);
    expect(plan?.activePause).toBeNull();
  });

  it("PRY-EJ-007 (phase 0) has no plan: null", async () => {
    expect(await fetchTimingPlan("PRY-EJ-007")).toBeNull();
  });

  it("cartera and plans agree for all rows: plan iff phase > 0, active pause iff paused", async () => {
    // RGB-13: the portfolio is real now; the sample plans still back PRY-EJ-00N, so they are checked against the fixtures.
    const { SAMPLE_ROWS } = await import("../helpers/portfolio-sample");
    for (const row of SAMPLE_ROWS) {
      const plan = await fetchTimingPlan(row.code);
      expect(plan === null).toBe(row.phase === 0);
      if (plan) {
        expect(plan.currentPhase).toBe(row.phase);
        expect(plan.activePause !== null).toBe(row.status === "paused");
      }
    }
  });
});
