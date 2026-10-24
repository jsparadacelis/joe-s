import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHead } from "@/components/layout/PageHead";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { StatusChip } from "@/components/ui/StatusChip";
import { Table } from "@/components/ui/Table";
import SettingsPage from "@/app/ajustes/page";
import PortfolioPage from "@/app/cartera/page";
import ToPromotePage from "@/app/por-promover/page";
import WeeklyReportPage from "@/app/reporte-semanal/page";

const mockPathname = jest.fn();
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname() }));

const pages = [
  ["/cartera", PortfolioPage],
  ["/por-promover", ToPromotePage],
  ["/reporte-semanal", WeeklyReportPage],
  ["/ajustes", SettingsPage],
] as const;

describe("axe sobre AppShell completo con cada página", () => {
  it.each(pages)("%s", async (path, Page) => {
    mockPathname.mockReturnValue(path);
    const { container } = render(
      <AppShell>
        <Page />
      </AppShell>,
    );
    expect(await axe(container)).toHaveNoViolations();
    expect(screen.getAllByRole("navigation")).toHaveLength(2);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("ruta desconocida", async () => {
    mockPathname.mockReturnValue("/otra");
    const { container } = render(<AppShell>contenido</AppShell>);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("axe sobre todos los componentes UI juntos", () => {
  it("sin violaciones", async () => {
    const { container } = render(
      <main>
        <h1>Prueba</h1>
        <Panel title="Panel" description="desc">
          <Table
            caption="Tabla"
            columns={[{ key: "a", header: "A", render: (r: { a: string }) => r.a }]}
            rows={[{ a: "uno" }]}
            getRowKey={(r) => r.a}
          />
        </Panel>
        <Button>Ok</Button>
        <Button disabled variant="point">Dis</Button>
        <StatusChip tone="ok" variant="traffic-light">Al día</StatusChip>
        <Notice tone="bad">Error</Notice>
        <Notice>Info</Notice>
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Table", () => {
  it("usa th scope=col", () => {
    render(
      <Table caption="T" columns={[{ key: "a", header: "A", render: () => "x" }, { key: "b", header: "B", render: () => "y" }]} rows={[{ id: "1" }]} getRowKey={(r) => r.id} />,
    );
    const ths = screen.getAllByRole("columnheader");
    expect(ths).toHaveLength(2);
    ths.forEach((th) => expect(th).toHaveAttribute("scope", "col"));
    expect(screen.getByRole("table", { name: "T" })).toBeInTheDocument();
  });

  it("sin filas muestra el mensaje por defecto con colSpan = nº de columnas", () => {
    render(<Table caption="T" columns={[{ key: "a", header: "A", render: () => "" }, { key: "b", header: "B", render: () => "" }]} rows={[]} getRowKey={() => "k"} />);
    const cell = screen.getByText("No hay registros para mostrar.");
    expect(cell).toHaveAttribute("colspan", "2");
  });

  it("emptyMessage personalizado", () => {
    render(<Table caption="T" columns={[{ key: "a", header: "A", render: () => "" }]} rows={[]} getRowKey={() => "k"} emptyMessage="Nada" />);
    expect(screen.getByText("Nada")).toBeInTheDocument();
  });

  it("sin columnas ni filas no rompe", () => {
    expect(() => render(<Table caption="T" columns={[]} rows={[]} getRowKey={() => "k"} />)).not.toThrow();
  });
});

describe("Notice", () => {
  it.each([
    ["info", "status"],
    ["ok", "status"],
    ["warn", "status"],
    ["bad", "alert"],
  ] as const)("tono %s usa role=%s", (tone, role) => {
    render(<Notice tone={tone}>Texto</Notice>);
    expect(screen.getByRole(role)).toHaveTextContent("Texto");
  });

  it("por defecto es status", () => {
    render(<Notice>Texto</Notice>);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("Button", () => {
  it("type por defecto es button (no envía formularios)", () => {
    render(<Button>Ir</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("acepta type=submit y disabled", () => {
    render(<Button type="submit" disabled>Enviar</Button>);
    const b = screen.getByRole("button", { name: "Enviar" });
    expect(b).toHaveAttribute("type", "submit");
    expect(b).toBeDisabled();
  });

  it("un click en un botón deshabilitado no dispara onClick", () => {
    const fn = jest.fn();
    render(<Button disabled onClick={fn}>X</Button>);
    screen.getByRole("button").click();
    expect(fn).not.toHaveBeenCalled();
  });

  it("className extra se añade sin perder las clases base", () => {
    render(<Button className="extra" size="sm" variant="primary">X</Button>);
    expect(screen.getByRole("button").className).toMatch(/extra/);
    expect(screen.getByRole("button").className).toMatch(/bg-ink/);
  });
});

describe("casos borde de componentes", () => {
  it("PageHead sin description ni actions solo muestra el h1", () => {
    const { container } = render(<PageHead title="T" />);
    expect(container.querySelectorAll("p")).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 1, name: "T" })).toBeInTheDocument();
  });

  it("PageHead con actions las renderiza", () => {
    render(<PageHead title="T" actions={<Button>A</Button>} />);
    expect(screen.getByRole("button", { name: "A" })).toBeInTheDocument();
  });

  it("Panel sin título ni hijos no genera encabezado", () => {
    render(<Panel />);
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("Panel respeta headingLevel=3 y omite description sin title", () => {
    render(<Panel title="Sub" headingLevel={3} description="d" />);
    expect(screen.getByRole("heading", { level: 3, name: "Sub" })).toBeInTheDocument();
    render(<Panel description="solo-desc" />);
    expect(screen.queryByText("solo-desc")).toBeNull();
  });

  it.each(["neutral", "ok", "warn", "bad", "point", "off"] as const)("StatusChip %s en ambas variantes", (tone) => {
    render(<><StatusChip tone={tone}>tag-{tone}</StatusChip><StatusChip tone={tone} variant="traffic-light">sem-{tone}</StatusChip></>);
    expect(screen.getByText(`tag-${tone}`)).toBeInTheDocument();
    expect(screen.getByText(`sem-${tone}`)).toBeInTheDocument();
  });

  it("StatusChip semáforo oculta el punto a lectores de pantalla", () => {
    const { container } = render(<StatusChip variant="traffic-light" tone="ok">Al día</StatusChip>);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("EmptyState muestra título y descripción", () => {
    render(<EmptyState title="Vacío" description="Nada aún" />);
    expect(screen.getByText("Vacío")).toBeInTheDocument();
    expect(screen.getByText("Nada aún")).toBeInTheDocument();
  });
});

describe("idioma", () => {
  it("<html lang=\"es\"> en el layout raíz", () => {
    const src = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
    expect(src).toMatch(/<html lang="es"/);
  });

  it("no hay palabras de UI en inglés en los textos de páginas ni componentes", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(n) ? [p] : [];
      });
    const english = /\b(Loading|Submit|Cancel|Save|Delete|Settings|Dashboard|Portfolio|Projects|Weekly report|No data|Welcome|Home|Search|Close|Next|Previous)\b/;
    const offenders: string[] = [];
    for (const f of ["app", "components"].flatMap((d) => walk(join(process.cwd(), d)))) {
      const src = readFileSync(f, "utf8");
      // solo texto entre etiquetas y valores de atributos de texto
      const texts = [...src.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]).concat([...src.matchAll(/(?:title|description|aria-label|caption|emptyMessage)=["']([^"']+)["']/g)].map((m) => m[1]));
      if (texts.some((t) => english.test(t))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
