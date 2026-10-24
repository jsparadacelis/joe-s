import { PHASES, type PhaseId } from "@/lib/phases";
import { listProjects, fetchDeliverable, fetchProject } from "@/lib/projects";

const IDS: PhaseId[] = [0, 1, 2, 3, 4, 5, 6, 7];

describe("listProjects", () => {
  it("returns the four sample projects with their current phase", async () => {
    const ps = await listProjects();
    expect(ps.map((p) => [p.code, p.currentPhase])).toEqual(
      expect.arrayContaining([
        ["PRY-EJ-001", 3],
        ["PRY-EJ-002", 0],
        ["PRY-EJ-003", 6],
        ["PRY-EJ-004", 2],
      ]),
    );
    expect(ps).toHaveLength(4);
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

  it("returns null if it does not exist", async () => {
    expect(await fetchProject("PRY-NO-EXISTE")).toBeNull();
    expect(await fetchProject("")).toBeNull();
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
