import { FASES, type FaseId } from "@/lib/fases";
import { listarProyectos, obtenerEntregable, obtenerProyecto } from "@/lib/proyectos";

const IDS: FaseId[] = [0, 1, 2, 3, 4, 5, 6, 7];

describe("listarProyectos", () => {
  it("devuelve los cuatro proyectos de ejemplo con su fase actual", async () => {
    const ps = await listarProyectos();
    expect(ps.map((p) => [p.codigo, p.faseActual])).toEqual(
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
    for (const p of await listarProyectos()) {
      expect(p.nombre).toContain("(ejemplo)");
      expect(p.codigo).toMatch(/^PRY-EJ-\d{3}$/);
    }
  });

  it("los códigos son únicos y la fase actual es válida", async () => {
    const ps = await listarProyectos();
    expect(new Set(ps.map((p) => p.codigo)).size).toBe(ps.length);
    for (const p of ps) expect(IDS).toContain(p.faseActual);
  });
});

describe("obtenerProyecto", () => {
  it("devuelve el proyecto existente", async () => {
    const p = await obtenerProyecto("PRY-EJ-001");
    expect(p).toMatchObject({ codigo: "PRY-EJ-001", faseActual: 3 });
    expect(p!.nombre).toContain("(ejemplo)");
  });

  it("devuelve null si no existe", async () => {
    expect(await obtenerProyecto("PRY-NO-EXISTE")).toBeNull();
    expect(await obtenerProyecto("")).toBeNull();
  });
});

describe("PRY-EJ-004 (RGB-29)", () => {
  it("es el local comercial de ejemplo, en la fase 2", async () => {
    expect(await obtenerProyecto("PRY-EJ-004")).toEqual({
      codigo: "PRY-EJ-004",
      nombre: "Local comercial (ejemplo)",
      faseActual: 2,
    });
  });

  it("el entregable de la fase 2 tiene campos y no está congelado", async () => {
    const e = await obtenerEntregable("PRY-EJ-004", 2);
    expect(e.fase).toBe(2);
    expect(e.versionCongelada).toBeNull();
    expect(e.campos.length).toBeGreaterThan(0);
    for (const c of e.campos) expect(c.etiqueta.length).toBeGreaterThan(0);
  });

  it("la fase 1 de PRY-EJ-004 está congelada", async () => {
    expect((await obtenerEntregable("PRY-EJ-004", 1)).versionCongelada).toEqual(expect.any(String));
  });
});

describe("obtenerEntregable", () => {
  it.each(IDS)("la fase %i del proyecto 001 tiene campos bien formados", async (fase) => {
    const e = await obtenerEntregable("PRY-EJ-001", fase);
    expect(e.fase).toBe(fase);
    expect(e.campos.length).toBeGreaterThan(0);
    expect(new Set(e.campos.map((c) => c.id)).size).toBe(e.campos.length);
    for (const c of e.campos) {
      expect(c.id.length).toBeGreaterThan(0);
      expect(c.etiqueta.length).toBeGreaterThan(0);
      expect(["texto", "area", "fecha"]).toContain(c.tipo);
      expect(typeof c.valor).toBe("string");
    }
  });

  it.each(["PRY-EJ-001", "PRY-EJ-002", "PRY-EJ-003", "PRY-EJ-004"])(
    "%s: versionCongelada no nula antes de la actual y nula en la actual y siguientes",
    async (codigo) => {
      const { faseActual } = (await obtenerProyecto(codigo))!;
      for (const fase of IDS) {
        const e = await obtenerEntregable(codigo, fase);
        if (fase < faseActual) {
          expect(typeof e.versionCongelada).toBe("string");
          expect(e.versionCongelada!.length).toBeGreaterThan(0);
        } else {
          expect(e.versionCongelada).toBeNull();
        }
      }
    },
  );

  it("el proyecto en fase 0 no tiene ninguna versión congelada", async () => {
    for (const fase of IDS) {
      expect((await obtenerEntregable("PRY-EJ-002", fase)).versionCongelada).toBeNull();
    }
  });

  it("los valores no parecen datos reales (sin correos ni teléfonos)", async () => {
    for (const p of await listarProyectos()) {
      for (const fase of IDS) {
        for (const c of (await obtenerEntregable(p.codigo, fase)).campos) {
          expect(c.valor).not.toMatch(/@/);
          expect(c.valor).not.toMatch(/\d{7,}/);
        }
      }
    }
  });

  it("hay una definición de fase para cada entregable (coherencia con FASES)", async () => {
    expect(FASES).toHaveLength(8);
    const e = await obtenerEntregable("PRY-EJ-003", 7);
    expect(e.fase).toBe(FASES[7].id);
  });
});
