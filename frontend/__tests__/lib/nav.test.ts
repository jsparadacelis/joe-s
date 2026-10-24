import { NAV_ITEMS, findNavItem } from "@/lib/nav";

describe("nav", () => {
  it("defines the five sections of the plan", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual([
      "/cartera", "/proyectos", "/por-promover", "/reporte-semanal", "/ajustes",
    ]);
  });

  it("finds the item by exact route or subroute", () => {
    expect(findNavItem("/proyectos")?.label).toBe("Proyectos");
    expect(findNavItem("/proyectos/abc")?.label).toBe("Proyectos");
    expect(findNavItem("/proyectosx")).toBeUndefined();
  });
});
