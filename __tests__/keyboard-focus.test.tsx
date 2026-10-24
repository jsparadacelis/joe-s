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

describe("keyboard navigation", () => {
  beforeEach(() => mockPathname.mockReturnValue("/cartera"));

  it("Tab goes through skip link, sidebar items and content buttons in order", async () => {
    const user = userEvent.setup();
    render(
      <AppShell>
        <Button>Primero</Button>
        <Button disabled>Deshabilitado</Button>
        <Button>Last</Button>
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
    await user.tab(); // skips the disabled one
    expect(screen.getByRole("button", { name: "Last" })).toHaveFocus();
  });

  it("the skip link points to an existing target (#contenido)", () => {
    render(<AppShell>x</AppShell>);
    const href = screen.getByRole("link", { name: "Saltar al contenido" }).getAttribute("href");
    expect(href).toBe("#contenido");
    expect(document.getElementById("contenido")?.tagName).toBe("MAIN");
  });

  it("Shift+Tab goes back through the sidebar", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    await user.tab();
    await user.tab();
    await user.tab({ shift: true });
    expect(screen.getByRole("link", { name: NAV_ITEMS[0].label })).toHaveFocus();
  });

  it("Enter and Space activate a focused button", async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Acción</Button>);
    await user.tab();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});

describe("aria-current by route", () => {
  it.each(NAV_ITEMS.map((i) => [i.href, i.label]))("on %s only «%s» is the current page", (href, label) => {
    mockPathname.mockReturnValue(href);
    render(<Sidebar />);
    const current = screen.getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");
    expect(current.map((l) => l.textContent)).toEqual([label]);
  });

  it("on a subroute the parent item is marked", () => {
    mockPathname.mockReturnValue("/proyectos/abc");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Proyectos" })).toHaveAttribute("aria-current", "page");
  });

  it("on an unknown route there is no current item", () => {
    mockPathname.mockReturnValue("/no-existe");
    render(<Sidebar />);
    expect(document.querySelector('[aria-current]')).toBeNull();
  });

  it("a partial prefix (/proyectosX) does not mark /proyectos", () => {
    mockPathname.mockReturnValue("/proyectosX");
    render(<Sidebar />);
    expect(document.querySelector('[aria-current]')).toBeNull();
  });
});

describe("visible focus (CSS)", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

  it("there is a :focus-visible rule with a token-based outline", () => {
    const m = css.match(/:focus-visible\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/outline:\s*\d+px solid var\(--focus\)/);
  });

  it("no component removes the outline", () => {
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
