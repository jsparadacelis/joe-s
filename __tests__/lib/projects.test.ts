import { PHASES, type PhaseId } from "@/lib/phases";
import { listProjects, fetchDeliverable, fetchProject } from "@/lib/projects";

const IDS: PhaseId[] = [0, 1, 2, 3, 4, 5, 6, 7];

describe("listarProyectos", () => {
  it("devuelve los cuatro proyectos de ejemplo con su fase actual", async () => {
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

  it("los datos son ficticios: «(ejemplo)» en el nombre y códigos PRY-EJ-NNN", async () => {
    for (const p of await listProjects()) {
      expect(p.name).toContain("(ejemplo)");
      expect(p.code).toMatch(/^PRY-EJ-\d{3}$/);
    }
  });

  it("los códigos son únicos y la fase actual es válida", async () => {
    const ps = await listProjects();
    expect(new Set(ps.map((p) => p.code)).size).toBe(ps.length);
    for (const p of ps) expect(IDS).toContain(p.currentPhase);
  });
});

describe("obtenerProyecto", () => {
  it("devuelve el proyecto existente", async () => {
    const p = await fetchProject("PRY-EJ-001");
    expect(p).toMatchObject({ code: "PRY-EJ-001", currentPhase: 3 });
    expect(p!.name).toContain("(ejemplo)");
  });

  it("devuelve null si no existe", async () => {
    expect(await fetchProject("PRY-NO-EXISTE")).toBeNull();
    expect(await fetchProject("")).toBeNull();
  });
});

describe("PRY-EJ-004 (RGB-29)", () => {
  it("es el local comercial de ejemplo, en la fase 2", async () => {
    expect(await fetchProject("PRY-EJ-004")).toEqual({
      code: "PRY-EJ-004",
      name: "Local comercial (ejemplo)",
      currentPhase: 2,
    });
  });

  it("el entregable de la fase 2 tiene campos y no está congelado", async () => {
    const e = await fetchDeliverable("PRY-EJ-004", 2);
    expect(e.phase).toBe(2);
    expect(e.frozenVersion).toBeNull();
    expect(e.fields.length).toBeGreaterThan(0);
    for (const c of e.fields) expect(c.label.length).toBeGreaterThan(0);
  });

  it("la fase 1 de PRY-EJ-004 está congelada", async () => {
    expect((await fetchDeliverable("PRY-EJ-004", 1)).frozenVersion).toEqual(expect.any(String));
  });
});

describe("obtenerEntregable", () => {
  it.each(IDS)("la fase %i del proyecto 001 tiene campos bien formados", async (phase) => {
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
    "%s: versionCongelada no nula antes de la actual y nula en la actual y siguientes",
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

  it("el proyecto en fase 0 no tiene ninguna versión congelada", async () => {
    for (const phase of IDS) {
      expect((await fetchDeliverable("PRY-EJ-002", phase)).frozenVersion).toBeNull();
    }
  });

  it("los valores no parecen datos reales (sin correos ni teléfonos)", async () => {
    for (const p of await listProjects()) {
      for (const phase of IDS) {
        for (const c of (await fetchDeliverable(p.code, phase)).fields) {
          expect(c.value).not.toMatch(/@/);
          expect(c.value).not.toMatch(/\d{7,}/);
        }
      }
    }
  });

  it("hay una definición de fase para cada entregable (coherencia con FASES)", async () => {
    expect(PHASES).toHaveLength(8);
    const e = await fetchDeliverable("PRY-EJ-003", 7);
    expect(e.phase).toBe(PHASES[7].id);
  });
});
