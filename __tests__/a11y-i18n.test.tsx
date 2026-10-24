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

describe("axe over the full AppShell with each page", () => {
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

  it("unknown route", async () => {
    mockPathname.mockReturnValue("/other");
    const { container } = render(<AppShell>contenido</AppShell>);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("axe over all UI components together", () => {
  it("no violations", async () => {
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
  it("uses th scope=col", () => {
    render(
      <Table caption="T" columns={[{ key: "a", header: "A", render: () => "x" }, { key: "b", header: "B", render: () => "y" }]} rows={[{ id: "1" }]} getRowKey={(r) => r.id} />,
    );
    const ths = screen.getAllByRole("columnheader");
    expect(ths).toHaveLength(2);
    ths.forEach((th) => expect(th).toHaveAttribute("scope", "col"));
    expect(screen.getByRole("table", { name: "T" })).toBeInTheDocument();
  });

  it("without rows shows the default message with colSpan = number of columns", () => {
    render(<Table caption="T" columns={[{ key: "a", header: "A", render: () => "" }, { key: "b", header: "B", render: () => "" }]} rows={[]} getRowKey={() => "k"} />);
    const cell = screen.getByText("No hay registros para mostrar.");
    expect(cell).toHaveAttribute("colspan", "2");
  });

  it("custom emptyMessage", () => {
    render(<Table caption="T" columns={[{ key: "a", header: "A", render: () => "" }]} rows={[]} getRowKey={() => "k"} emptyMessage="Nada" />);
    expect(screen.getByText("Nada")).toBeInTheDocument();
  });

  it("without columns or rows does not break", () => {
    expect(() => render(<Table caption="T" columns={[]} rows={[]} getRowKey={() => "k"} />)).not.toThrow();
  });
});

describe("Notice", () => {
  it.each([
    ["info", "status"],
    ["ok", "status"],
    ["warn", "status"],
    ["bad", "alert"],
  ] as const)("tone %s uses role=%s", (tone, role) => {
    render(<Notice tone={tone}>Texto</Notice>);
    expect(screen.getByRole(role)).toHaveTextContent("Texto");
  });

  it("defaults to status", () => {
    render(<Notice>Texto</Notice>);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("Button", () => {
  it("type defaults to button (does not submit forms)", () => {
    render(<Button>Ir</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("accepts type=submit and disabled", () => {
    render(<Button type="submit" disabled>Enviar</Button>);
    const b = screen.getByRole("button", { name: "Enviar" });
    expect(b).toHaveAttribute("type", "submit");
    expect(b).toBeDisabled();
  });

  it("a click on a disabled button does not fire onClick", () => {
    const fn = jest.fn();
    render(<Button disabled onClick={fn}>X</Button>);
    screen.getByRole("button").click();
    expect(fn).not.toHaveBeenCalled();
  });

  it("extra className is added without losing the base classes", () => {
    render(<Button className="extra" size="sm" variant="primary">X</Button>);
    expect(screen.getByRole("button").className).toMatch(/extra/);
    expect(screen.getByRole("button").className).toMatch(/bg-ink/);
  });
});

describe("component edge cases", () => {
  it("PageHead without description or actions only shows the h1", () => {
    const { container } = render(<PageHead title="T" />);
    expect(container.querySelectorAll("p")).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 1, name: "T" })).toBeInTheDocument();
  });

  it("PageHead with actions renders them", () => {
    render(<PageHead title="T" actions={<Button>A</Button>} />);
    expect(screen.getByRole("button", { name: "A" })).toBeInTheDocument();
  });

  it("Panel without title or children does not generate a heading", () => {
    render(<Panel />);
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("Panel honours headingLevel=3 and omits description without title", () => {
    render(<Panel title="Sub" headingLevel={3} description="d" />);
    expect(screen.getByRole("heading", { level: 3, name: "Sub" })).toBeInTheDocument();
    render(<Panel description="solo-desc" />);
    expect(screen.queryByText("solo-desc")).toBeNull();
  });

  it.each(["neutral", "ok", "warn", "bad", "point", "off"] as const)("StatusChip %s in both variants", (tone) => {
    render(<><StatusChip tone={tone}>tag-{tone}</StatusChip><StatusChip tone={tone} variant="traffic-light">sem-{tone}</StatusChip></>);
    expect(screen.getByText(`tag-${tone}`)).toBeInTheDocument();
    expect(screen.getByText(`sem-${tone}`)).toBeInTheDocument();
  });

  it("StatusChip traffic light hides the dot from screen readers", () => {
    const { container } = render(<StatusChip variant="traffic-light" tone="ok">Al día</StatusChip>);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("EmptyState shows title and description", () => {
    render(<EmptyState title="Empty" description="Nothing yet" />);
    expect(screen.getByText("Empty")).toBeInTheDocument();
    expect(screen.getByText("Nothing yet")).toBeInTheDocument();
  });
});

describe("language", () => {
  it("<html lang=\"es\"> in the root layout", () => {
    const src = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
    expect(src).toMatch(/<html lang="es"/);
  });

  it("no English UI words in the texts of pages or components", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(n) ? [p] : [];
      });
    const english = /\b(Loading|Submit|Cancel|Save|Delete|Settings|Dashboard|Portfolio|Projects|Weekly report|No data|Welcome|Home|Search|Close|Next|Previous)\b/;
    const offenders: string[] = [];
    for (const f of ["app", "components"].flatMap((d) => walk(join(process.cwd(), d)))) {
      const src = readFileSync(f, "utf8");
      // only text between tags and values of text attributes
      const texts = [...src.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]).concat([...src.matchAll(/(?:title|description|aria-label|caption|emptyMessage)=["']([^"']+)["']/g)].map((m) => m[1]));
      if (texts.some((t) => english.test(t))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
