import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import PlanAndTimingPage from "@/app/projects/[code]/plan-and-timing/page";
import ProjectLayout from "@/app/projects/[code]/layout";
import { stubProjectNotFound } from "../helpers/mock-api";

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

beforeEach(() => mockPathname.mockReturnValue("/projects/PRY-EJ-001/plan-and-timing"));

// RGB-13: «NO-EXISTE» is asked to the API now; it answers 404 project_not_found.
let restoreFetch: () => void;
beforeEach(() => {
  restoreFetch = stubProjectNotFound();
});
afterEach(() => restoreFetch());

describe("/projects/[code]/plan-and-timing", () => {
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
    mockPathname.mockReturnValue("/projects/PRY-EJ-003/plan-and-timing");
    render(await page("PRY-EJ-003"));
    expect(screen.getByRole("status")).toHaveTextContent("Espera de organismo");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("progressbar")).toHaveLength(7);
  });

  it("PRY-EJ-004 (phase 2, RGB-29): shows its plan with seven bars and a single h1", async () => {
    mockPathname.mockReturnValue("/projects/PRY-EJ-004/plan-and-timing");
    render(await page("PRY-EJ-004"));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("progressbar")).toHaveLength(7);
    expect(screen.queryByText("Sin plan hasta promover")).not.toBeInTheDocument();
  });

  it("PRY-EJ-002 (phase 0): empty state «Sin plan hasta promover», no table or bars", async () => {
    mockPathname.mockReturnValue("/projects/PRY-EJ-002/plan-and-timing");
    render(await page("PRY-EJ-002"));
    expect(screen.getByText("Sin plan hasta promover")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  // RGB-11 fix F1: portfolio projects 005..007 are reachable from the tabs.
  it.each(["PRY-EJ-005", "PRY-EJ-006"])("%s (past phase 0): shows its plan with seven bars", async (c) => {
    mockPathname.mockReturnValue(`/projects/${c}/plan-and-timing`);
    render(await page(c));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("progressbar")).toHaveLength(7);
    expect(screen.queryByText("Sin plan hasta promover")).not.toBeInTheDocument();
  });

  it("PRY-EJ-007 (phase 0): empty state «Sin plan hasta promover», not a 404", async () => {
    mockPathname.mockReturnValue("/projects/PRY-EJ-007/plan-and-timing");
    render(await page("PRY-EJ-007"));
    expect(screen.getByText("Sin plan hasta promover")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it.each(["PRY-EJ-001", "PRY-EJ-002", "PRY-EJ-003", "PRY-EJ-004", "PRY-EJ-005", "PRY-EJ-006", "PRY-EJ-007"])("%s: no accessibility violations", async (c) => {
    const { container } = render(<main>{await page(c)}</main>);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("/projects/[code]/layout", () => {
  it("renders the project tabs above children", async () => {
    mockPathname.mockReturnValue("/projects/PRY-EJ-001/phase/3");
    render(await layout("PRY-EJ-001"));
    const nav = screen.getByRole("navigation", { name: "Secciones del proyecto" });
    expect(nav).toBeInTheDocument();
    const child = screen.getByText("Contenido hijo");
    expect(child).toBeInTheDocument();
    expect(nav.compareDocumentPosition(child) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the tabs point to the project's current phase and to Plan y tiempos", async () => {
    render(await layout("PRY-EJ-003"));
    expect(screen.getByRole("link", { name: "Fase y promoción" })).toHaveAttribute("href", "/projects/PRY-EJ-003/phase/6");
    expect(screen.getByRole("link", { name: "Plan y tiempos" })).toHaveAttribute(
      "href",
      "/projects/PRY-EJ-003/plan-and-timing",
    );
  });

  it("even a project in phase 0 shows both tabs", async () => {
    render(await layout("PRY-EJ-002"));
    expect(screen.getByRole("link", { name: "Fase y promoción" })).toHaveAttribute("href", "/projects/PRY-EJ-002/phase/0");
    expect(screen.getByRole("link", { name: "Plan y tiempos" })).toBeInTheDocument();
  });

  it.each([
    ["PRY-EJ-005", 5],
    ["PRY-EJ-006", 4],
    ["PRY-EJ-007", 0],
  ])("%s resolves (no 404) and its phase tab points to phase %i", async (code, f) => {
    render(await layout(code));
    expect(screen.getByRole("link", { name: "Fase y promoción" })).toHaveAttribute("href", `/projects/${code}/phase/${f}`);
    expect(screen.getByText("Contenido hijo")).toBeInTheDocument();
  });

  it("returns 404 if the project does not exist", async () => {
    await expect(layout("NO-EXISTE")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("no accessibility violations", async () => {
    const { container } = render(<main>{await layout("PRY-EJ-001")}</main>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
