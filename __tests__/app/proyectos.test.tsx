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
