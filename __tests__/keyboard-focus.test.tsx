import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/Button";
import { NAV_ITEMS } from "@/lib/nav";

const mockPathname = jest.fn();
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname() }));

describe("navegación por teclado", () => {
  beforeEach(() => mockPathname.mockReturnValue("/cartera"));

  it("Tab recorre skip link, ítems de la barra lateral y botones del contenido en orden", async () => {
    const user = userEvent.setup();
    render(
      <AppShell>
        <Button>Primero</Button>
        <Button disabled>Deshabilitado</Button>
        <Button>Último</Button>
      </AppShell>,
    );
    await user.tab();
    expect(screen.getByRole("link", { name: "Saltar al contenido" })).toHaveFocus();
    for (const item of NAV_ITEMS) {
      await user.tab();
      expect(screen.getByRole("link", { name: item.label })).toHaveFocus();
    }
    await user.tab();
    expect(screen.getByRole("button", { name: "Primero" })).toHaveFocus();
    await user.tab(); // salta el deshabilitado
    expect(screen.getByRole("button", { name: "Último" })).toHaveFocus();
  });

  it("el skip link apunta a un destino existente (#contenido)", () => {
    render(<AppShell>x</AppShell>);
    const href = screen.getByRole("link", { name: "Saltar al contenido" }).getAttribute("href");
    expect(href).toBe("#contenido");
    expect(document.getElementById("contenido")?.tagName).toBe("MAIN");
  });

  it("Shift+Tab vuelve atrás por la barra lateral", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    await user.tab();
    await user.tab();
    await user.tab({ shift: true });
    expect(screen.getByRole("link", { name: NAV_ITEMS[0].label })).toHaveFocus();
  });

  it("Enter y Space activan un botón enfocado", async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Acción</Button>);
    await user.tab();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});

describe("aria-current por ruta", () => {
  it.each(NAV_ITEMS.map((i) => [i.href, i.label]))("en %s solo «%s» es la página actual", (href, label) => {
    mockPathname.mockReturnValue(href);
    render(<Sidebar />);
    const current = screen.getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");
    expect(current.map((l) => l.textContent)).toEqual([label]);
  });

  it("en una subruta se marca el ítem padre", () => {
    mockPathname.mockReturnValue("/proyectos/abc");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Proyectos" })).toHaveAttribute("aria-current", "page");
  });

  it("en una ruta desconocida no hay ningún ítem actual", () => {
    mockPathname.mockReturnValue("/no-existe");
    render(<Sidebar />);
    expect(document.querySelector('[aria-current]')).toBeNull();
  });

  it("un prefijo parcial (/proyectosX) no marca /proyectos", () => {
    mockPathname.mockReturnValue("/proyectosX");
    render(<Sidebar />);
    expect(document.querySelector('[aria-current]')).toBeNull();
  });
});

describe("foco visible (CSS)", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

  it("existe una regla :focus-visible con outline basado en token", () => {
    const m = css.match(/:focus-visible\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/outline:\s*\d+px solid var\(--focus\)/);
  });

  it("ningún componente elimina el outline", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [];
      });
    const offenders = ["app", "components"]
      .flatMap((d) => walk(join(process.cwd(), d)))
      .filter((f) => /outline-none|outline-0|focus:outline-hidden/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
