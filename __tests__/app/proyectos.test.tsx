import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import ProyectosPage from "@/app/proyectos/page";
import ProyectoPage from "@/app/proyectos/[codigo]/page";
import FasePage from "@/app/proyectos/[codigo]/fase/[fase]/page";

jest.mock("next/navigation", () => ({
  usePathname: () => "/proyectos",
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const fase = (codigo: string, f: string) =>
  FasePage({ params: Promise.resolve({ codigo, fase: f }) });

describe("/proyectos", () => {
  it("lista los proyectos de ejemplo con enlace a su fase actual", async () => {
    render(await ProyectosPage());
    expect(screen.getByRole("heading", { level: 1, name: "Proyectos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /PRY-EJ-001/ })).toHaveAttribute("href", "/proyectos/PRY-EJ-001/fase/3");
    expect(screen.getByRole("link", { name: /PRY-EJ-002/ })).toHaveAttribute("href", "/proyectos/PRY-EJ-002/fase/0");
    expect(screen.getByRole("link", { name: /PRY-EJ-003/ })).toHaveAttribute("href", "/proyectos/PRY-EJ-003/fase/6");
    expect(screen.getByRole("link", { name: /PRY-EJ-004/ })).toHaveAttribute("href", "/proyectos/PRY-EJ-004/fase/2");
  });

  it("indica que son proyectos de ejemplo", async () => {
    render(await ProyectosPage());
    expect(screen.getAllByText(/\(ejemplo\)/).length).toBeGreaterThanOrEqual(3);
  });

  it("sin violaciones de accesibilidad", async () => {
    const { container } = render(<main>{await ProyectosPage()}</main>);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("/proyectos/[codigo]", () => {
  it("redirige a la fase actual del proyecto", async () => {
    await expect(ProyectoPage({ params: Promise.resolve({ codigo: "PRY-EJ-001" }) })).rejects.toThrow(
      "/proyectos/PRY-EJ-001/fase/3",
    );
    await expect(ProyectoPage({ params: Promise.resolve({ codigo: "PRY-EJ-002" }) })).rejects.toThrow(
      "/proyectos/PRY-EJ-002/fase/0",
    );
  });

  it("devuelve 404 si el proyecto no existe", async () => {
    await expect(ProyectoPage({ params: Promise.resolve({ codigo: "NO-EXISTE" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});

describe("/proyectos/[codigo]/fase/[fase]", () => {
  it("fase actual: línea de fases, sin aviso y campos editables con Guardar", async () => {
    render(await fase("PRY-EJ-001", "3"));
    expect(screen.getByRole("navigation", { name: "Fases del proyecto" })).toBeInTheDocument();
    expect(screen.getAllByRole("link").find((l) => l.getAttribute("aria-current") === "page")).toHaveAttribute(
      "href",
      "/proyectos/PRY-EJ-001/fase/3",
    );
    expect(screen.queryByText(/Fase cerrada/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Vista previa/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    const campos = screen.getAllByRole("textbox");
    expect(campos.length).toBeGreaterThan(0);
    for (const c of campos) expect(c).toBeEnabled();
  });

  it("fase anterior: solo lectura, aviso de fase cerrada y volver a la actual", async () => {
    render(await fase("PRY-EJ-001", "1"));
    expect(screen.getByText(/Fase cerrada · versión congelada/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a la fase actual" })).toHaveAttribute(
      "href",
      "/proyectos/PRY-EJ-001/fase/3",
    );
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
    const campos = screen.getAllByRole("textbox") as HTMLInputElement[];
    expect(campos.length).toBeGreaterThan(0);
    for (const c of campos) expect(c.readOnly || c.disabled).toBe(true);
    const nav = screen.getByRole("navigation", { name: "Fases del proyecto" });
    expect(within(nav).getAllByRole("link").filter((l) => l.hasAttribute("aria-current"))).toHaveLength(1);
  });

  it("fase siguiente: vista previa, aviso y todo deshabilitado", async () => {
    render(await fase("PRY-EJ-001", "5"));
    expect(screen.getByText("Vista previa: nada se guarda en esta fase")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a la fase actual" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
    for (const c of screen.getAllByRole("textbox")) expect(c).toBeDisabled();
  });

  it("muestra una sola cabecera de nivel 1", async () => {
    render(await fase("PRY-EJ-003", "6"));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it.each(["8", "-1", "01", "abc", ""])("fase inválida %j devuelve 404", async (f) => {
    await expect(fase("PRY-EJ-001", f)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("proyecto inexistente devuelve 404", async () => {
    await expect(fase("NO-EXISTE", "0")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("sin violaciones de accesibilidad en modo solo lectura y vista previa", async () => {
    for (const f of ["1", "5", "3"]) {
      const { container, unmount } = render(<main>{await fase("PRY-EJ-001", f)}</main>);
      expect(await axe(container)).toHaveNoViolations();
      unmount();
    }
  });
});

describe("/proyectos/[codigo]/fase/2 · datos técnicos (RGB-29)", () => {
  const TITULO = "Datos técnicos del inmueble";

  it("PRY-EJ-004 (fase actual): panel con la referencia prellenada y «Obtener datos técnicos»", async () => {
    render(await fase("PRY-EJ-004", "2"));
    expect(screen.getByRole("heading", { name: TITULO })).toBeInTheDocument();
    expect(screen.getByLabelText(/Referencia catastral/)).toHaveValue("1234567DG3413S0001AB");
    expect(screen.getByRole("button", { name: "Obtener datos técnicos" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "Parcela" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("PRY-EJ-004 sigue mostrando el entregable genérico, con «Guardar»", async () => {
    render(await fase("PRY-EJ-004", "2"));
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: TITULO })).toBeInTheDocument();
  });

  it("PRY-EJ-001 (fase hecha): solo lectura, con datos guardados visibles y deshabilitados", async () => {
    render(await fase("PRY-EJ-001", "2"));
    expect(screen.getByRole("heading", { name: TITULO })).toBeInTheDocument();
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
    for (const nombre of [/Obtener datos técnicos/, /Volver a consultar/, /Marcar todo como verificado/]) {
      const b = screen.queryByRole("button", { name: nombre });
      if (b) expect(b).toBeDisabled();
    }
  });

  it("PRY-EJ-002 (fase siguiente): vista previa con la consulta deshabilitada", async () => {
    render(await fase("PRY-EJ-002", "2"));
    expect(screen.getByRole("heading", { name: TITULO })).toBeInTheDocument();
    // El plan no fija si, sin datos, la vista previa muestra la entrada o un aviso: ambos valen, pero nunca consultable.
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
  ])("%s fase %s: no muestra el panel de datos técnicos", async (codigo, f) => {
    render(await fase(codigo, f));
    expect(screen.queryByRole("heading", { name: TITULO })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Obtener datos técnicos/ })).not.toBeInTheDocument();
  });

  it.each([
    ["PRY-EJ-004", "2"],
    ["PRY-EJ-001", "2"],
    ["PRY-EJ-002", "2"],
  ])("%s fase %s: sin violaciones de accesibilidad", async (codigo, f) => {
    const { container } = render(<main>{await fase(codigo, f)}</main>);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("/proyectos/[codigo]/fase/3 · visor de relieve 3D (RGB-34)", () => {
  const TITULO = "Relieve 3D del terreno";

  it("PRY-EJ-001 (fase actual): panel con la referencia de la ficha, bajo el entregable genérico", async () => {
    render(await fase("PRY-EJ-001", "3"));
    const panel = screen.getByRole("heading", { name: TITULO });
    expect(panel).toBeInTheDocument();
    expect(screen.getByLabelText("Referencia catastral")).toHaveValue("1234567DG3413S0001AB");
    expect(screen.getByRole("button", { name: "Ver relieve" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    const entregable = screen.getByRole("heading", { name: /^Entregable/ });
    expect(entregable.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it.each([
    ["PRY-EJ-002", "vista previa (fase actual 0)"],
    ["PRY-EJ-004", "vista previa (fase actual 2)"],
    ["PRY-EJ-003", "solo lectura (fase actual 6)"],
  ])("%s fase 3, %s: el visor también está disponible (es consulta, no guarda nada)", async (codigo) => {
    render(await fase(codigo, "3"));
    expect(screen.getByRole("heading", { name: TITULO })).toBeInTheDocument();
    expect(screen.getByLabelText("Referencia catastral")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ver relieve" })).toBeEnabled();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("PRY-EJ-002 fase 3: sin referencia en la ficha, el mensaje guía del visor", async () => {
    render(await fase("PRY-EJ-002", "3"));
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
  ])("%s fase %s: no muestra el visor de relieve", async (codigo, f) => {
    render(await fase(codigo, f));
    expect(screen.queryByRole("heading", { name: TITULO })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver relieve" })).not.toBeInTheDocument();
  });

  it.each([
    ["PRY-EJ-001", "3"],
    ["PRY-EJ-002", "3"],
    ["PRY-EJ-003", "3"],
  ])("%s fase %s: sin violaciones de accesibilidad", async (codigo, f) => {
    const { container } = render(<main>{await fase(codigo, f)}</main>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
