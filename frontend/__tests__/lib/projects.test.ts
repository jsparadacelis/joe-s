import { ApiError } from "@/lib/api";
import { PHASES, type PhaseId } from "@/lib/phases";
import { apiProject } from "../helpers/portfolio-sample";
import { listProjects, fetchDeliverable, fetchProject } from "@/lib/projects";

const IDS: PhaseId[] = [0, 1, 2, 3, 4, 5, 6, 7];

describe("listProjects", () => {
  // RGB-11 fix F1: the portfolio links to PRY-EJ-005..007, so lib/projects.ts now knows seven projects (was four).
  it("returns the seven sample projects with their current phase", async () => {
    const ps = await listProjects();
    expect(ps.map((p) => [p.code, p.currentPhase])).toEqual(
      expect.arrayContaining([
        ["PRY-EJ-001", 3],
        ["PRY-EJ-002", 0],
        ["PRY-EJ-003", 6],
        ["PRY-EJ-004", 2],
        ["PRY-EJ-005", 5],
        ["PRY-EJ-006", 4],
        ["PRY-EJ-007", 0],
      ]),
    );
    expect(ps).toHaveLength(7);
  });

  it("the data is fictitious: «(ejemplo)» in the name and PRY-EJ-NNN codes", async () => {
    for (const p of await listProjects()) {
      expect(p.name).toContain("(ejemplo)");
      expect(p.code).toMatch(/^PRY-EJ-\d{3}$/);
    }
  });

  it("codes are unique and the current phase is valid", async () => {
    const ps = await listProjects();
    expect(new Set(ps.map((p) => p.code)).size).toBe(ps.length);
    for (const p of ps) expect(IDS).toContain(p.currentPhase);
  });
});

describe("fetchProject", () => {
  it("returns the existing project", async () => {
    const p = await fetchProject("PRY-EJ-001");
    expect(p).toMatchObject({ code: "PRY-EJ-001", currentPhase: 3 });
    expect(p!.name).toContain("(ejemplo)");
  });

  // RGB-13: a code that is not a sample project is asked to the API; 404 means «does not exist».
  it("returns null if the API answers 404 project_not_found", async () => {
    const request = jest.fn().mockRejectedValue(new ApiError(404, "project_not_found", "No existe el proyecto PRY-NO-EXISTE."));
    expect(await fetchProject("PRY-NO-EXISTE", request)).toBeNull();
    expect(request).toHaveBeenCalledWith("/api/projects/PRY-NO-EXISTE");
  });

  it("returns null for an empty code without calling the API", async () => {
    const request = jest.fn();
    expect(await fetchProject("", request)).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});

describe("real projects from the API (RGB-13)", () => {
  const created = { code: "PRY-2026-001", name: "Test opportunity", current_phase: 0 };

  it("fetchProject reads GET /api/projects/{code} and maps current_phase to currentPhase", async () => {
    const request = jest.fn().mockResolvedValue(created);
    expect(await fetchProject("PRY-2026-001", request)).toEqual({
      code: "PRY-2026-001",
      name: "Test opportunity",
      currentPhase: 0,
    });
    expect(request).toHaveBeenCalledWith("/api/projects/PRY-2026-001");
  });

  it("the code is encoded in the path", async () => {
    const request = jest.fn().mockRejectedValue(new ApiError(404, "project_not_found", "x"));
    await fetchProject("a/b?c", request);
    expect(request).toHaveBeenCalledWith("/api/projects/a%2Fb%3Fc");
  });

  it("sample projects (PRY-EJ-00N) are served locally: the API is not called", async () => {
    const request = jest.fn();
    expect(await fetchProject("PRY-EJ-001", request)).toMatchObject({ code: "PRY-EJ-001", currentPhase: 3 });
    expect(request).not.toHaveBeenCalled();
  });

  it("errors other than 404 are not hidden as «not found»", async () => {
    const failure = new ApiError(0, "network_error", "No se pudo conectar con el servidor.");
    await expect(fetchProject("PRY-2026-001", jest.fn().mockRejectedValue(failure))).rejects.toBe(failure);
    const server = new ApiError(500, "unexpected_error", "Ocurrió un error inesperado.");
    await expect(fetchProject("PRY-2026-001", jest.fn().mockRejectedValue(server))).rejects.toBe(server);
  });

  it("a 404 with another code is not «not found» either", async () => {
    const failure = new ApiError(404, "unexpected_error", "Ocurrió un error inesperado.");
    await expect(fetchProject("PRY-2026-001", jest.fn().mockRejectedValue(failure))).rejects.toBe(failure);
  });

  it("listProjects returns the real projects of the portfolio followed by the samples", async () => {
    const request = jest.fn().mockResolvedValue({
      as_of: "2026-10-24",
      projects: [apiProject({ code: "PRY-2026-001", name: "Test opportunity", phase: 0 })],
    });
    const list = await listProjects(request);
    expect(request).toHaveBeenCalledWith("/api/portfolio");
    expect(list[0]).toEqual({ code: "PRY-2026-001", name: "Test opportunity", currentPhase: 0 });
    expect(list.slice(1).map((p) => p.code)).toEqual([
      "PRY-EJ-001", "PRY-EJ-002", "PRY-EJ-003", "PRY-EJ-004", "PRY-EJ-005", "PRY-EJ-006", "PRY-EJ-007",
    ]);
  });

  it("listProjects keeps the samples when the API fails (the screens for samples must not break)", async () => {
    const list = await listProjects(jest.fn().mockRejectedValue(new ApiError(0, "network_error", "x")));
    expect(list).toHaveLength(7);
  });

  it("the deliverable of a real project is empty but well-formed and never frozen", async () => {
    const e = await fetchDeliverable("PRY-2026-001", 0);
    expect(e).toEqual({ phase: 0, frozenVersion: null, fields: [] });
  });
});

describe("PRY-EJ-004 (RGB-29)", () => {
  it("is the sample commercial premises, in phase 2", async () => {
    expect(await fetchProject("PRY-EJ-004")).toEqual({
      code: "PRY-EJ-004",
      name: "Local comercial (ejemplo)",
      currentPhase: 2,
    });
  });

  it("the phase 2 deliverable has fields and is not frozen", async () => {
    const e = await fetchDeliverable("PRY-EJ-004", 2);
    expect(e.phase).toBe(2);
    expect(e.frozenVersion).toBeNull();
    expect(e.fields.length).toBeGreaterThan(0);
    for (const c of e.fields) expect(c.label.length).toBeGreaterThan(0);
  });

  it("phase 1 of PRY-EJ-004 is frozen", async () => {
    expect((await fetchDeliverable("PRY-EJ-004", 1)).frozenVersion).toEqual(expect.any(String));
  });
});

describe("fetchDeliverable", () => {
  it.each(IDS)("phase %i of project 001 has well-formed fields", async (phase) => {
    const e = await fetchDeliverable("PRY-EJ-001", phase);
    expect(e.phase).toBe(phase);
    expect(e.fields.length).toBeGreaterThan(0);
    expect(new Set(e.fields.map((c) => c.id)).size).toBe(e.fields.length);
    for (const c of e.fields) {
      expect(c.id.length).toBeGreaterThan(0);
      expect(c.label.length).toBeGreaterThan(0);
      expect(["text", "textarea", "date"]).toContain(c.type);
      expect(typeof c.value).toBe("string");
    }
  });

  it.each(["PRY-EJ-001", "PRY-EJ-002", "PRY-EJ-003", "PRY-EJ-004"])(
    "%s: frozenVersion non-null before the current one and null on the current and later ones",
    async (code) => {
      const { currentPhase } = (await fetchProject(code))!;
      for (const phase of IDS) {
        const e = await fetchDeliverable(code, phase);
        if (phase < currentPhase) {
          expect(typeof e.frozenVersion).toBe("string");
          expect(e.frozenVersion!.length).toBeGreaterThan(0);
        } else {
          expect(e.frozenVersion).toBeNull();
        }
      }
    },
  );

  it("the project in phase 0 has no frozen version", async () => {
    for (const phase of IDS) {
      expect((await fetchDeliverable("PRY-EJ-002", phase)).frozenVersion).toBeNull();
    }
  });

  it("the values do not look like real data (no emails or phone numbers)", async () => {
    for (const p of await listProjects()) {
      for (const phase of IDS) {
        for (const c of (await fetchDeliverable(p.code, phase)).fields) {
          expect(c.value).not.toMatch(/@/);
          expect(c.value).not.toMatch(/\d{7,}/);
        }
      }
    }
  });

  it("there is a phase definition for each deliverable (consistency with PHASES)", async () => {
    expect(PHASES).toHaveLength(8);
    const e = await fetchDeliverable("PRY-EJ-003", 7);
    expect(e.phase).toBe(PHASES[7].id);
  });
});
