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

describe("/proyectos/[codigo]/plan-y-tiempos", () => {
  it("devuelve 404 si el proyecto no existe", async () => {
    await expect(page("NO-EXISTE")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("PRY-EJ-001: resumen, tabla por fase e historial de pausas con un único h1", async () => {
    render(await page("PRY-EJ-001"));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    // resumen con los valores del servicio
    expect(screen.getByText(/11\s*\/\s*64\s*sem/)).toBeInTheDocument();
    expect(screen.getByText(/4\s*sem en pausa/)).toBeInTheDocument();
    expect(screen.getByText(/15\s*sem de calendario/)).toBeInTheDocument();
    expect(screen.getByText(/\+1\s*sem de desviación/)).toBeInTheDocument();
    // tabla por fase: 7 barras y semáforos
    expect(screen.getAllByRole("progressbar")).toHaveLength(7);
    expect(screen.getAllByText("Plan superado").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Atención").length).toBeGreaterThanOrEqual(1);
    // historial: dos tablas (fases e historial) y filas de pausa
    expect(screen.getAllByRole("table")).toHaveLength(2);
    expect(screen.getAllByText(/Espera|Decisión|Otra/).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Sin pausas registradas")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin plan hasta promover")).not.toBeInTheDocument();
  });

  it("PRY-EJ-001 sin pausa activa: no hay aviso de pausa", async () => {
    render(await page("PRY-EJ-001"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("PRY-EJ-003: muestra el aviso de pausa activa con su motivo", async () => {
    mockPathname.mockReturnValue("/proyectos/PRY-EJ-003/plan-y-tiempos");
    render(await page("PRY-EJ-003"));
    expect(screen.getByRole("status")).toHaveTextContent("Espera de organismo");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("progressbar")).toHaveLength(7);
  });

  it("PRY-EJ-004 (fase 2, RGB-29): muestra su plan con siete barras y un único h1", async () => {
    mockPathname.mockReturnValue("/proyectos/PRY-EJ-004/plan-y-tiempos");
    render(await page("PRY-EJ-004"));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("progressbar")).toHaveLength(7);
    expect(screen.queryByText("Sin plan hasta promover")).not.toBeInTheDocument();
  });

  it("PRY-EJ-002 (fase 0): estado vacío «Sin plan hasta promover», sin tabla ni barras", async () => {
    mockPathname.mockReturnValue("/proyectos/PRY-EJ-002/plan-y-tiempos");
    render(await page("PRY-EJ-002"));
    expect(screen.getByText("Sin plan hasta promover")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it.each(["PRY-EJ-001", "PRY-EJ-002", "PRY-EJ-003", "PRY-EJ-004"])("%s: sin violaciones de accesibilidad", async (c) => {
    const { container } = render(<main>{await page(c)}</main>);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("/proyectos/[codigo]/layout", () => {
  it("renderiza las pestañas del proyecto encima de children", async () => {
    mockPathname.mockReturnValue("/proyectos/PRY-EJ-001/fase/3");
    render(await layout("PRY-EJ-001"));
    const nav = screen.getByRole("navigation", { name: "Secciones del proyecto" });
    expect(nav).toBeInTheDocument();
    const child = screen.getByText("Contenido hijo");
    expect(child).toBeInTheDocument();
    expect(nav.compareDocumentPosition(child) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("las pestañas apuntan a la fase actual del proyecto y a Plan y tiempos", async () => {
    render(await layout("PRY-EJ-003"));
    expect(screen.getByRole("link", { name: "Fase y promoción" })).toHaveAttribute("href", "/proyectos/PRY-EJ-003/fase/6");
    expect(screen.getByRole("link", { name: "Plan y tiempos" })).toHaveAttribute(
      "href",
      "/proyectos/PRY-EJ-003/plan-y-tiempos",
    );
  });

  it("incluso un proyecto en fase 0 muestra ambas pestañas", async () => {
    render(await layout("PRY-EJ-002"));
    expect(screen.getByRole("link", { name: "Fase y promoción" })).toHaveAttribute("href", "/proyectos/PRY-EJ-002/fase/0");
    expect(screen.getByRole("link", { name: "Plan y tiempos" })).toBeInTheDocument();
  });

  it("devuelve 404 si el proyecto no existe", async () => {
    await expect(layout("NO-EXISTE")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("sin violaciones de accesibilidad", async () => {
    const { container } = render(<main>{await layout("PRY-EJ-001")}</main>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
