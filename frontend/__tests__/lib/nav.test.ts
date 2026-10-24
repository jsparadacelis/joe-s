import { NAV_ITEMS, findNavItem } from "@/lib/nav";

describe("nav", () => {
  it("defines the five sections of the plan", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual([
      "/portfolio", "/projects", "/to-promote", "/weekly-report", "/settings",
    ]);
  });

  it("finds the item by exact route or subroute", () => {
    expect(findNavItem("/projects")?.label).toBe("Proyectos");
    expect(findNavItem("/projects/abc")?.label).toBe("Proyectos");
    expect(findNavItem("/projectsx")).toBeUndefined();
  });
});
