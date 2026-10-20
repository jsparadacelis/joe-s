import { NAV_ITEMS, findNavItem } from "@/lib/nav";

describe("nav", () => {
  it("define las cinco secciones del plan", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual([
      "/cartera", "/proyectos", "/por-promover", "/reporte-semanal", "/ajustes",
    ]);
  });

  it("encuentra el ítem por ruta exacta o subruta", () => {
    expect(findNavItem("/proyectos")?.label).toBe("Proyectos");
    expect(findNavItem("/proyectos/abc")?.label).toBe("Proyectos");
    expect(findNavItem("/proyectosx")).toBeUndefined();
  });
});
