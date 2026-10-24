import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import PlanAndTimingPage from "@/app/proyectos/[code]/plan-y-tiempos/page";
import ProjectLayout from "@/app/proyectos/[code]/layout";

const mockPathname = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const page = (code: string) => PlanAndTimingPage({ params: Promise.resolve({ code }) });
const layout = (code: string) =>
  ProjectLayout({ params: Promise.resolve({ code }), children: <p>Contenido hijo</p> });

beforeEach(() => mockPathname.mockReturnValue("/proyectos/PRY-EJ-001/plan-y-tiempos"));

describe("/proyectos/[code]/plan-y-tiempos", () => {
  it("returns 404 if the project does not exist", async () => {
    await expect(page("NO-EXISTE")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("PRY-EJ-001: summary, per-phase table and pause history with a single h1", async () => {
    render(await page("PRY-EJ-001"));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    // summary with the values from the service
    expect(screen.getByText(/11\s*\/\s*64\s*sem/)).toBeInTheDocument();
    expect(screen.getByText(/4\s*sem en pausa/)).toBeInTheDocument();
    expect(screen.getByText(/15\s*sem de calendario/)).toBeInTheDocument();
    expect(screen.getByText(/\+1\s*sem de desviación/)).toBeInTheDocument();
    // per-phase table: 7 bars and traffic lights
    expect(screen.getAllByRole("progressbar")).toHaveLength(7);
    expect(screen.getAllByText("Plan superado").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Atención").length).toBeGreaterThanOrEqual(1);
    // history: two tables (phases and history) and pause rows
    expect(screen.getAllByRole("table")).toHaveLength(2);
    expect(screen.getAllByText(/Espera|Decisión|Otra/).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Sin pausas registradas")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin plan hasta promover")).not.toBeInTheDocument();
  });

  it("PRY-EJ-001 without an active pause: no pause notice", async () => {
    render(await page("PRY-EJ-001"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("PRY-EJ-003: shows the active-pause notice with its reason", async () => {
    mockPathname.mockReturnValue("/proyectos/PRY-EJ-003/plan-y-tiempos");
    render(await page("PRY-EJ-003"));
    expect(screen.getByRole("status")).toHaveTextContent("Espera de organismo");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("progressbar")).toHaveLength(7);
  });

  it("PRY-EJ-004 (phase 2, RGB-29): shows its plan with seven bars and a single h1", async () => {
    mockPathname.mockReturnValue("/proyectos/PRY-EJ-004/plan-y-tiempos");
    render(await page("PRY-EJ-004"));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("progressbar")).toHaveLength(7);
    expect(screen.queryByText("Sin plan hasta promover")).not.toBeInTheDocument();
  });

  it("PRY-EJ-002 (phase 0): empty state «Sin plan hasta promover», no table or bars", async () => {
    mockPathname.mockReturnValue("/proyectos/PRY-EJ-002/plan-y-tiempos");
    render(await page("PRY-EJ-002"));
    expect(screen.getByText("Sin plan hasta promover")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it.each(["PRY-EJ-001", "PRY-EJ-002", "PRY-EJ-003", "PRY-EJ-004"])("%s: no accessibility violations", async (c) => {
    const { container } = render(<main>{await page(c)}</main>);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("/proyectos/[code]/layout", () => {
  it("renders the project tabs above children", async () => {
    mockPathname.mockReturnValue("/proyectos/PRY-EJ-001/fase/3");
    render(await layout("PRY-EJ-001"));
    const nav = screen.getByRole("navigation", { name: "Secciones del proyecto" });
    expect(nav).toBeInTheDocument();
    const child = screen.getByText("Contenido hijo");
    expect(child).toBeInTheDocument();
    expect(nav.compareDocumentPosition(child) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the tabs point to the project's current phase and to Plan y tiempos", async () => {
    render(await layout("PRY-EJ-003"));
    expect(screen.getByRole("link", { name: "Fase y promoción" })).toHaveAttribute("href", "/proyectos/PRY-EJ-003/fase/6");
    expect(screen.getByRole("link", { name: "Plan y tiempos" })).toHaveAttribute(
      "href",
      "/proyectos/PRY-EJ-003/plan-y-tiempos",
    );
  });

  it("even a project in phase 0 shows both tabs", async () => {
    render(await layout("PRY-EJ-002"));
    expect(screen.getByRole("link", { name: "Fase y promoción" })).toHaveAttribute("href", "/proyectos/PRY-EJ-002/fase/0");
    expect(screen.getByRole("link", { name: "Plan y tiempos" })).toBeInTheDocument();
  });

  it("returns 404 if the project does not exist", async () => {
    await expect(layout("NO-EXISTE")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("no accessibility violations", async () => {
    const { container } = render(<main>{await layout("PRY-EJ-001")}</main>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
