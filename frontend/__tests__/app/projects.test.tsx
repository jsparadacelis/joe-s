import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import ProjectsPage from "@/app/projects/page";
import ProjectPage from "@/app/projects/[code]/page";
import PhasePage from "@/app/projects/[code]/phase/[phase]/page";

jest.mock("next/navigation", () => ({
  usePathname: () => "/projects",
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const phase = (code: string, f: string) =>
  PhasePage({ params: Promise.resolve({ code, phase: f }) });

describe("/projects", () => {
  it("lists the sample projects with a link to their current phase", async () => {
    render(await ProjectsPage());
    expect(screen.getByRole("heading", { level: 1, name: "Proyectos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /PRY-EJ-001/ })).toHaveAttribute("href", "/projects/PRY-EJ-001/phase/3");
    expect(screen.getByRole("link", { name: /PRY-EJ-002/ })).toHaveAttribute("href", "/projects/PRY-EJ-002/phase/0");
    expect(screen.getByRole("link", { name: /PRY-EJ-003/ })).toHaveAttribute("href", "/projects/PRY-EJ-003/phase/6");
    expect(screen.getByRole("link", { name: /PRY-EJ-004/ })).toHaveAttribute("href", "/projects/PRY-EJ-004/phase/2");
  });

  it("states that they are sample projects", async () => {
    render(await ProjectsPage());
    expect(screen.getAllByText(/\(ejemplo\)/).length).toBeGreaterThanOrEqual(3);
  });

  it("no accessibility violations", async () => {
    const { container } = render(<main>{await ProjectsPage()}</main>);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("/projects/[code]", () => {
  it("redirects to the project's current phase", async () => {
    await expect(ProjectPage({ params: Promise.resolve({ code: "PRY-EJ-001" }) })).rejects.toThrow(
      "/projects/PRY-EJ-001/phase/3",
    );
    await expect(ProjectPage({ params: Promise.resolve({ code: "PRY-EJ-002" }) })).rejects.toThrow(
      "/projects/PRY-EJ-002/phase/0",
    );
  });

  it("returns 404 if the project does not exist", async () => {
    await expect(ProjectPage({ params: Promise.resolve({ code: "NO-EXISTE" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});

describe("/projects/[code]/phase/[phase]", () => {
  it("current phase: phase timeline, no notice and editable fields with Guardar", async () => {
    render(await phase("PRY-EJ-001", "3"));
    expect(screen.getByRole("navigation", { name: "Fases del proyecto" })).toBeInTheDocument();
    expect(screen.getAllByRole("link").find((l) => l.getAttribute("aria-current") === "page")).toHaveAttribute(
      "href",
      "/projects/PRY-EJ-001/phase/3",
    );
    expect(screen.queryByText(/Fase cerrada/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Vista previa/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    const fields = screen.getAllByRole("textbox");
    expect(fields.length).toBeGreaterThan(0);
    for (const c of fields) expect(c).toBeEnabled();
  });

  it("previous phase: read-only, closed-phase notice and back to the current one", async () => {
    render(await phase("PRY-EJ-001", "1"));
    expect(screen.getByText(/Fase cerrada · versión congelada/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a la fase actual" })).toHaveAttribute(
      "href",
      "/projects/PRY-EJ-001/phase/3",
    );
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
    const fields = screen.getAllByRole("textbox") as HTMLInputElement[];
    expect(fields.length).toBeGreaterThan(0);
    for (const c of fields) expect(c.readOnly || c.disabled).toBe(true);
    const nav = screen.getByRole("navigation", { name: "Fases del proyecto" });
    expect(within(nav).getAllByRole("link").filter((l) => l.hasAttribute("aria-current"))).toHaveLength(1);
  });

  it("next phase: preview, notice and everything disabled", async () => {
    render(await phase("PRY-EJ-001", "5"));
    expect(screen.getByText("Vista previa: nada se guarda en esta fase")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a la fase actual" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
    for (const c of screen.getAllByRole("textbox")) expect(c).toBeDisabled();
  });

  it("shows a single level-1 heading", async () => {
    render(await phase("PRY-EJ-003", "6"));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it.each(["8", "-1", "01", "abc", ""])("invalid phase %j returns 404", async (f) => {
    await expect(phase("PRY-EJ-001", f)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("nonexistent project returns 404", async () => {
    await expect(phase("NO-EXISTE", "0")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("no accessibility violations in read-only and preview modes", async () => {
    for (const f of ["1", "5", "3"]) {
      const { container, unmount } = render(<main>{await phase("PRY-EJ-001", f)}</main>);
      expect(await axe(container)).toHaveNoViolations();
      unmount();
    }
  });
});

describe("/projects/[code]/phase/2 · technical data (RGB-29)", () => {
  const TITLE = "Datos técnicos del inmueble";

  it("PRY-EJ-004 (current phase): panel with the prefilled reference and «Obtener datos técnicos»", async () => {
    render(await phase("PRY-EJ-004", "2"));
    expect(screen.getByRole("heading", { name: TITLE })).toBeInTheDocument();
    expect(screen.getByLabelText(/Referencia catastral/)).toHaveValue("1234567DG3413S0001AB");
    expect(screen.getByRole("button", { name: "Obtener datos técnicos" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "Parcela" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("PRY-EJ-004 still shows the generic deliverable, with «Guardar»", async () => {
    render(await phase("PRY-EJ-004", "2"));
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: TITLE })).toBeInTheDocument();
  });

  it("PRY-EJ-001 (done phase): read-only, with saved data visible and disabled", async () => {
    render(await phase("PRY-EJ-001", "2"));
    expect(screen.getByRole("heading", { name: TITLE })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Parcela" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Capacidad" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Dirección/)).toBeDisabled();
    expect(screen.getByLabelText(/^Dirección/)).not.toHaveValue("");
    expect(screen.getByLabelText(/^Zona climática/)).toBeDisabled();
    expect(screen.getByLabelText(/^Edificabilidad/)).toBeDisabled();
    expect(screen.getAllByRole("checkbox")).toHaveLength(26);
    for (const c of screen.getAllByRole("checkbox")) expect(c).toBeDisabled();
    expect(screen.getByText("Todo verificado")).toBeInTheDocument();
    expect(screen.getByText("2 editados")).toBeInTheDocument();
    for (const name of [/Obtener datos técnicos/, /Volver a consultar/, /Marcar todo como verificado/]) {
      const b = screen.queryByRole("button", { name: name });
      if (b) expect(b).toBeDisabled();
    }
  });

  it("PRY-EJ-002 (next phase): preview with the query disabled", async () => {
    render(await phase("PRY-EJ-002", "2"));
    expect(screen.getByRole("heading", { name: TITLE })).toBeInTheDocument();
    // The plan does not fix whether, without data, the preview shows the input or a notice: both are fine, but never queryable.
    const b = screen.queryByRole("button", { name: /Obtener datos técnicos/ });
    if (b) expect(b).toBeDisabled();
    else expect(screen.getByText("Sin datos técnicos registrados.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Parcela" })).not.toBeInTheDocument();
  });

  it.each([
    ["PRY-EJ-001", "3"],
    ["PRY-EJ-001", "1"],
    ["PRY-EJ-004", "3"],
    ["PRY-EJ-004", "1"],
    ["PRY-EJ-003", "6"],
  ])("%s phase %s: does not show the technical data panel", async (code, f) => {
    render(await phase(code, f));
    expect(screen.queryByRole("heading", { name: TITLE })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Obtener datos técnicos/ })).not.toBeInTheDocument();
  });

  it.each([
    ["PRY-EJ-004", "2"],
    ["PRY-EJ-001", "2"],
    ["PRY-EJ-002", "2"],
  ])("%s phase %s: no accessibility violations", async (code, f) => {
    const { container } = render(<main>{await phase(code, f)}</main>);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("/projects/[code]/phase/3 · 3D relief viewer (RGB-34)", () => {
  const TITLE = "Relieve 3D del terreno";

  it("PRY-EJ-001 (current phase): panel with the sheet's reference, below the generic deliverable", async () => {
    render(await phase("PRY-EJ-001", "3"));
    const panel = screen.getByRole("heading", { name: TITLE });
    expect(panel).toBeInTheDocument();
    expect(screen.getByLabelText("Referencia catastral")).toHaveValue("1234567DG3413S0001AB");
    expect(screen.getByRole("button", { name: "Ver relieve" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    const deliverable = screen.getByRole("heading", { name: /^Entregable/ });
    expect(deliverable.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it.each([
    ["PRY-EJ-002", "preview (current phase 0)"],
    ["PRY-EJ-004", "preview (current phase 2)"],
    ["PRY-EJ-003", "read-only (current phase 6)"],
  ])("%s phase 3, %s: the viewer is also available (it is a query, saves nothing)", async (code) => {
    render(await phase(code, "3"));
    expect(screen.getByRole("heading", { name: TITLE })).toBeInTheDocument();
    expect(screen.getByLabelText("Referencia catastral")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ver relieve" })).toBeEnabled();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("PRY-EJ-002 phase 3: no reference on the sheet, the viewer's guide message", async () => {
    render(await phase("PRY-EJ-002", "3"));
    expect(screen.getByLabelText("Referencia catastral")).toHaveValue("");
    expect(
      screen.getByText("Escribe una referencia catastral de 20 caracteres y pulsa «Ver relieve»."),
    ).toBeInTheDocument();
  });

  it.each([
    ["PRY-EJ-001", "0"],
    ["PRY-EJ-001", "1"],
    ["PRY-EJ-001", "2"],
    ["PRY-EJ-001", "4"],
    ["PRY-EJ-001", "5"],
    ["PRY-EJ-001", "6"],
    ["PRY-EJ-001", "7"],
    ["PRY-EJ-004", "2"],
    ["PRY-EJ-003", "6"],
  ])("%s phase %s: does not show the relief viewer", async (code, f) => {
    render(await phase(code, f));
    expect(screen.queryByRole("heading", { name: TITLE })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver relieve" })).not.toBeInTheDocument();
  });

  it.each([
    ["PRY-EJ-001", "3"],
    ["PRY-EJ-002", "3"],
    ["PRY-EJ-003", "3"],
  ])("%s phase %s: no accessibility violations", async (code, f) => {
    const { container } = render(<main>{await phase(code, f)}</main>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
