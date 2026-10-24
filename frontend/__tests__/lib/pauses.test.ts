import { ApiError } from "@/lib/api";
import {
  PAUSE_REASONS,
  fetchPauses,
  overdueText,
  pauseProject,
  resumeProject,
  validatePause,
} from "@/lib/pauses";

const API_PAUSE = {
  id: "11111111-1111-1111-1111-111111111111",
  phase: 2,
  reason: "client_wait",
  started_on: "2026-10-24",
  expected_resumption: "2026-11-09",
  resumed_on: null,
  overdue: false,
  days_overdue: 0,
};
const TODAY = "2026-10-24";

describe("fetchPauses", () => {
  it("calls GET /api/projects/{code}/pauses and maps snake_case to camelCase", async () => {
    const request = jest.fn().mockResolvedValue({
      active: { ...API_PAUSE, overdue: true, days_overdue: 3 },
      history: [{ ...API_PAUSE, reason: "authority_wait", resumed_on: "2026-10-30" }],
    });
    const result = await fetchPauses("PRY-2026-001", request);
    expect(request).toHaveBeenCalledWith("/api/projects/PRY-2026-001/pauses");
    expect(result.active).toEqual({
      id: API_PAUSE.id,
      phase: 2,
      reason: "client-wait",
      startedOn: "2026-10-24",
      expectedResumption: "2026-11-09",
      resumedOn: null,
      overdue: true,
      daysOverdue: 3,
    });
    expect(result.history).toHaveLength(1);
    expect(result.history[0]).toMatchObject({ reason: "authority-wait", resumedOn: "2026-10-30" });
  });

  it("maps all four reasons and treats an unknown one as «other»", async () => {
    const request = jest.fn().mockResolvedValue({
      active: null,
      history: ["client_wait", "authority_wait", "internal_decision", "other", "zzz"].map((reason) => ({
        ...API_PAUSE,
        reason,
      })),
    });
    const { history } = await fetchPauses("PRY-2026-001", request);
    expect(history.map((p) => p.reason)).toEqual([
      "client-wait",
      "authority-wait",
      "internal-decision",
      "other",
      "other",
    ]);
  });

  it("keeps the order of the history (most recent first) and a null active pause", async () => {
    const request = jest.fn().mockResolvedValue({
      active: null,
      history: [{ ...API_PAUSE, id: "b" }, { ...API_PAUSE, id: "a" }],
    });
    const result = await fetchPauses("PRY-2026-001", request);
    expect(result.active).toBeNull();
    expect(result.history.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("encodes the code in the path", async () => {
    const request = jest.fn().mockResolvedValue({ active: null, history: [] });
    await fetchPauses("A/B", request);
    expect(request).toHaveBeenCalledWith("/api/projects/A%2FB/pauses");
  });

  it("propagates ApiError", async () => {
    const request = jest.fn().mockRejectedValue(new ApiError(404, "project_not_found", "No existe el proyecto X."));
    await expect(fetchPauses("X", request)).rejects.toMatchObject({ status: 404 });
  });
});

describe("pauseProject", () => {
  it("POSTs the reason with underscores and the date, and maps the created pause", async () => {
    const request = jest.fn().mockResolvedValue(API_PAUSE);
    const created = await pauseProject("PRY-2026-001", "internal-decision", "2026-11-09", request);
    expect(request).toHaveBeenCalledWith("/api/projects/PRY-2026-001/pause", {
      method: "POST",
      body: { reason: "internal_decision", expected_resumption: "2026-11-09" },
    });
    expect(created).toMatchObject({ id: API_PAUSE.id, reason: "client-wait", startedOn: "2026-10-24" });
  });

  it("propagates the ApiError with its field", async () => {
    const request = jest
      .fn()
      .mockRejectedValue(new ApiError(422, "invalid_field", "El campo «Motivo» no es válido: no es un motivo admitido.", "reason"));
    await expect(pauseProject("P", "other", "2026-11-09", request)).rejects.toMatchObject({ status: 422, field: "reason" });
  });
});

describe("resumeProject", () => {
  it("POSTs without a body and maps the closed pause", async () => {
    const request = jest.fn().mockResolvedValue({ ...API_PAUSE, resumed_on: "2026-10-25" });
    const closed = await resumeProject("PRY-2026-001", request);
    expect(request).toHaveBeenCalledWith("/api/projects/PRY-2026-001/resume", { method: "POST" });
    expect(closed.resumedOn).toBe("2026-10-25");
  });
});

describe("validatePause (same messages as the contract)", () => {
  const ok = { reason: "client-wait", expectedResumption: "2026-11-09" };

  it("a valid draft has no errors", () => {
    expect(validatePause(ok, TODAY)).toEqual({});
  });

  it("today is allowed, as the API only rejects dates before today", () => {
    expect(validatePause({ ...ok, expectedResumption: TODAY }, TODAY)).toEqual({});
  });

  it("reports both missing fields at once", () => {
    expect(validatePause({ reason: "", expectedResumption: "" }, TODAY)).toEqual({
      reason: "El campo «Motivo» es obligatorio.",
      expectedResumption: "El campo «Fecha prevista de reanudación» es obligatorio.",
    });
  });

  it("rejects a reason that is not one of the four", () => {
    expect(validatePause({ ...ok, reason: "nope" }, TODAY).reason).toBe(
      "El campo «Motivo» no es válido: no es un motivo admitido.",
    );
  });

  it("rejects a date that does not exist", () => {
    expect(validatePause({ ...ok, expectedResumption: "2026-02-30" }, TODAY).expectedResumption).toBe(
      "El campo «Fecha prevista de reanudación» no es válido: no es una fecha existente.",
    );
  });

  it("rejects a date that is not written yyyy-mm-dd, with the API's wording", () => {
    for (const text of ["hoy", "2026-1-5", "05/11/2026"]) {
      expect(validatePause({ ...ok, expectedResumption: text }, TODAY).expectedResumption).toBe(
        "El campo «Fecha prevista de reanudación» no es válido: debe ser una fecha con formato aaaa-mm-dd.",
      );
    }
  });

  it("rejects a date before today", () => {
    expect(validatePause({ ...ok, expectedResumption: "2026-10-23" }, TODAY).expectedResumption).toBe(
      "El campo «Fecha prevista de reanudación» no es válido: no puede ser anterior a hoy.",
    );
  });

  it("exposes the four reasons", () => {
    expect([...PAUSE_REASONS]).toEqual(["client-wait", "authority-wait", "internal-decision", "other"]);
  });
});

describe("overdueText", () => {
  it.each([
    [1, "Vencida hace 1 día"],
    [2, "Vencida hace 2 días"],
    [30, "Vencida hace 30 días"],
  ])("%i days", (days, text) => {
    expect(overdueText(days)).toBe(text);
  });
});
