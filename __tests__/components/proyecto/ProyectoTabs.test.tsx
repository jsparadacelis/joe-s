import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { ProyectoTabs } from "@/components/proyecto/ProyectoTabs";

const mockPathname = jest.fn();
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname() }));

function nav() {
  return screen.getByRole("navigation", { name: "Secciones del proyecto" });
}
const FASE = "Fase y promoción";
const PLAN = "Plan y tiempos";

describe("ProyectoTabs", () => {
  beforeEach(() => mockPathname.mockReturnValue("/proyectos/PRY-EJ-001/fase/3"));

  it("es una navegación «Secciones del proyecto» con dos enlaces con el texto exacto", () => {
    render(<ProyectoTabs codigo="PRY-EJ-001" faseActual={3} />);
    const links = within(nav()).getAllByRole("link");
    expect(links.map((l) => l.textContent?.trim())).toEqual([FASE, PLAN]);
  });

  it("«Fase y promoción» lleva a la fase actual y «Plan y tiempos» a su pestaña", () => {
    render(<ProyectoTabs codigo="PRY-EJ-001" faseActual={3} />);
    expect(screen.getByRole("link", { name: FASE })).toHaveAttribute("href", "/proyectos/PRY-EJ-001/fase/3");
    expect(screen.getByRole("link", { name: PLAN })).toHaveAttribute("href", "/proyectos/PRY-EJ-001/plan-y-tiempos");
  });

  it("usa el código y la fase actual recibidos", () => {
    render(<ProyectoTabs codigo="PRY-EJ-003" faseActual={6} />);
    expect(screen.getByRole("link", { name: FASE })).toHaveAttribute("href", "/proyectos/PRY-EJ-003/fase/6");
    expect(screen.getByRole("link", { name: PLAN })).toHaveAttribute("href", "/proyectos/PRY-EJ-003/plan-y-tiempos");
  });

  it("fase actual 0 enlaza a /fase/0", () => {
    render(<ProyectoTabs codigo="PRY-EJ-002" faseActual={0} />);
    expect(screen.getByRole("link", { name: FASE })).toHaveAttribute("href", "/proyectos/PRY-EJ-002/fase/0");
  });

  it.each(["/proyectos/PRY-EJ-001/fase/3", "/proyectos/PRY-EJ-001/fase/1", "/proyectos/PRY-EJ-001/fase/7"])(
    "en %s solo «Fase y promoción» tiene aria-current=page",
    (ruta) => {
      mockPathname.mockReturnValue(ruta);
      render(<ProyectoTabs codigo="PRY-EJ-001" faseActual={3} />);
      expect(screen.getByRole("link", { name: FASE })).toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("link", { name: PLAN })).not.toHaveAttribute("aria-current");
    },
  );

  it("en plan-y-tiempos solo «Plan y tiempos» tiene aria-current=page", () => {
    mockPathname.mockReturnValue("/proyectos/PRY-EJ-001/plan-y-tiempos");
    render(<ProyectoTabs codigo="PRY-EJ-001" faseActual={3} />);
    expect(screen.getByRole("link", { name: PLAN })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: FASE })).not.toHaveAttribute("aria-current");
  });

  it.each(["/proyectos/PRY-EJ-001", "/cartera", "/"])("en la ruta %s ninguna pestaña está activa", (ruta) => {
    mockPathname.mockReturnValue(ruta);
    render(<ProyectoTabs codigo="PRY-EJ-001" faseActual={3} />);
    for (const l of within(nav()).getAllByRole("link")) expect(l).not.toHaveAttribute("aria-current");
  });

  it("Tab recorre las dos pestañas en orden", async () => {
    const user = userEvent.setup();
    render(<ProyectoTabs codigo="PRY-EJ-001" faseActual={3} />);
    await user.tab();
    expect(screen.getByRole("link", { name: FASE })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: PLAN })).toHaveFocus();
  });

  it("Enter sobre una pestaña enfocada activa su enlace", async () => {
    const user = userEvent.setup();
    render(<ProyectoTabs codigo="PRY-EJ-001" faseActual={3} />);
    const destino = screen.getByRole("link", { name: PLAN });
    const onClick = jest.fn((e: Event) => e.preventDefault());
    destino.addEventListener("click", onClick);
    await user.tab();
    await user.tab();
    expect(destino).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it.each(["/proyectos/PRY-EJ-001/fase/3", "/proyectos/PRY-EJ-001/plan-y-tiempos"])(
    "sin violaciones de accesibilidad en %s",
    async (ruta) => {
      mockPathname.mockReturnValue(ruta);
      const { container } = render(<ProyectoTabs codigo="PRY-EJ-001" faseActual={3} />);
      expect(await axe(container)).toHaveNoViolations();
    },
  );
});
