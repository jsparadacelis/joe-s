import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { PortfolioTable } from "@/components/portfolio/PortfolioTable";
import { ROWS, makeRow } from "../../helpers/portfolio-rows";

/** The <tr> that holds the project link whose name contains `code`. */
function rowOf(code: string): HTMLElement {
  const row = screen.getByRole("link", { name: new RegExp(code) }).closest("tr");
  if (!row) throw new Error(`no row for ${code}`);
  return row;
}

describe("PortfolioTable horizontal scroll (RGB-11 fix F2)", () => {
  it("wraps the table in a keyboard-focusable scroll region named «Tabla de la cartera»", () => {
    render(<PortfolioTable rows={ROWS} />);
    const region = screen.getByRole("region", { name: "Tabla de la cartera" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveClass("overflow-x-auto");
    expect(region).toContainElement(screen.getByRole("table", { name: "Proyectos de la cartera" }));
    expect(region.className).toMatch(/focus-visible:/);
  });

  it("the days text never wraps (whitespace-nowrap)", () => {
    render(<PortfolioTable rows={[makeRow({ daysSinceUpdate: 12 })]} />);
    expect(screen.getByText("12 días")).toHaveClass("whitespace-nowrap");
  });

  it("no accessibility violations with the scroll region", async () => {
    const { container } = render(
      <main>
        <PortfolioTable rows={ROWS} />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("PortfolioTable structure", () => {
  it("is a table named «Proyectos de la cartera»", () => {
    render(<PortfolioTable rows={ROWS} />);
    expect(screen.getByRole("table", { name: "Proyectos de la cartera" })).toBeInTheDocument();
  });

  it("has the seven columns in order", () => {
    render(<PortfolioTable rows={ROWS} />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual([
      "Proyecto",
      "Fase",
      "Semáforo",
      "Próximo hito",
      "Responsable",
      "Bloqueo",
      "Días sin actualizar",
    ]);
    screen.getAllByRole("columnheader").forEach((h) => expect(h).toHaveAttribute("scope", "col"));
  });

  it("renders one body row per project, in the given order", () => {
    render(<PortfolioTable rows={ROWS} />);
    expect(screen.getAllByRole("row")).toHaveLength(ROWS.length + 1);
    const codes = screen.getAllByRole("link").map((l) => l.textContent);
    ROWS.forEach((r, i) => expect(codes[i]).toContain(r.code));
  });
});

describe("PortfolioTable cells", () => {
  it("project cell shows code and name; owner cell shows the owner", () => {
    render(<PortfolioTable rows={ROWS} />);
    const row = within(rowOf("PRY-EJ-901"));
    expect(row.getByText("PRY-EJ-901")).toBeInTheDocument();
    expect(row.getByText("Alpha house (ejemplo)")).toBeInTheDocument();
    expect(row.getByText("Ana Test")).toBeInTheDocument();
  });

  it.each([
    [0, "Oportunidad"],
    [3, "Anteproyecto"],
    [7, "Cierre"],
  ] as const)("phase %i is shown as «%i. name»", (phase, name) => {
    render(<PortfolioTable rows={[makeRow({ phase })]} />);
    expect(within(rowOf("PRY-EJ-901")).getByText(`${phase}. ${name}`)).toBeInTheDocument();
  });

  it.each([
    ["green", "En plazo", "bg-ok"],
    ["amber", "Atención", "bg-warn"],
    ["red", "Plan superado", "bg-bad"],
    ["paused", "En pausa", "bg-off"],
    ["no-plan", "Sin plan", "bg-off"],
  ] as const)("status %s shows «%s» as a traffic-light chip with the %s dot", (status, label, dot) => {
    render(<PortfolioTable rows={[makeRow({ status })]} />);
    const chip = within(rowOf("PRY-EJ-901")).getByText(label);
    expect(chip.querySelector('[aria-hidden="true"]')).toHaveClass(dot);
  });

  it("shows the label as text (not only colour) in every row", () => {
    render(<PortfolioTable rows={ROWS} />);
    const labels = ["En plazo", "Atención", "Plan superado", "En pausa", "Sin plan"];
    ROWS.forEach((r, i) => expect(within(rowOf(r.code)).getByText(labels[i])).toBeInTheDocument());
  });

  it("next milestone shows its name and the date as dd/mm/aaaa inside <time>", () => {
    render(<PortfolioTable rows={ROWS} />);
    const row = within(rowOf("PRY-EJ-902"));
    expect(row.getByText("Permit filing")).toBeInTheDocument();
    const time = row.getByText("30/11/2026");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("datetime", "2026-11-30");
  });

  it("without a next milestone shows «Sin hito próximo» and no <time>", () => {
    render(<PortfolioTable rows={ROWS} />);
    const row = rowOf("PRY-EJ-905");
    expect(within(row).getByText("Sin hito próximo")).toBeInTheDocument();
    expect(row.querySelector("time")).toBeNull();
  });

  it("shows the blocker text, or «Sin bloqueo» when there is none", () => {
    render(<PortfolioTable rows={ROWS} />);
    expect(within(rowOf("PRY-EJ-902")).getByText("Waiting for the permit office")).toBeInTheDocument();
    expect(within(rowOf("PRY-EJ-902")).queryByText("Sin bloqueo")).not.toBeInTheDocument();
    expect(within(rowOf("PRY-EJ-901")).getByText("Sin bloqueo")).toBeInTheDocument();
  });

  it.each([
    [0, "Hoy"],
    [1, "1 día"],
    [5, "5 días"],
    [12, "12 días"],
  ])("%i days since update is shown as «%s»", (days, text) => {
    render(<PortfolioTable rows={[makeRow({ daysSinceUpdate: days })]} />);
    expect(within(rowOf("PRY-EJ-901")).getByText(text)).toBeInTheDocument();
  });
});

describe("PortfolioTable stale sheets", () => {
  it("marks with the text «Desactualizada» only sheets with more than 7 days (8 yes, 7 no)", () => {
    render(
      <PortfolioTable
        rows={[
          makeRow({ code: "PRY-EJ-910", daysSinceUpdate: 7 }),
          makeRow({ code: "PRY-EJ-911", daysSinceUpdate: 8 }),
          makeRow({ code: "PRY-EJ-912", daysSinceUpdate: 0 }),
        ]}
      />,
    );
    expect(within(rowOf("PRY-EJ-910")).queryByText("Desactualizada")).not.toBeInTheDocument();
    expect(within(rowOf("PRY-EJ-911")).getByText("Desactualizada")).toBeInTheDocument();
    expect(within(rowOf("PRY-EJ-912")).queryByText("Desactualizada")).not.toBeInTheDocument();
  });

  it("the stale marker sits in the same row as the days, and the days text stays", () => {
    render(<PortfolioTable rows={ROWS} />);
    const row = within(rowOf("PRY-EJ-904"));
    expect(row.getByText("9 días")).toBeInTheDocument();
    expect(row.getByText("Desactualizada")).toBeInTheDocument();
    expect(screen.getAllByText("Desactualizada")).toHaveLength(2);
  });
});

describe("PortfolioTable row navigation", () => {
  it("each row has exactly one link to /projects/[code]/phase/[current phase]", () => {
    render(<PortfolioTable rows={ROWS} />);
    for (const r of ROWS) {
      const links = within(rowOf(r.code)).getAllByRole("link");
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAttribute("href", `/projects/${r.code}/phase/${r.phase}`);
    }
    expect(screen.getAllByRole("link")).toHaveLength(ROWS.length);
  });

  it("the link name contains the code and the project name", () => {
    render(<PortfolioTable rows={[ROWS[0]]} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAccessibleName(/PRY-EJ-901/);
    expect(link).toHaveAccessibleName(/Alpha house \(ejemplo\)/);
  });

  it("the whole row is clickable: stretched link (after:absolute after:inset-0) inside a relative <tr>", () => {
    render(<PortfolioTable rows={ROWS} />);
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveClass("after:absolute", "after:inset-0");
      expect(link.closest("tr")).toHaveClass("relative");
    }
  });

  it("an opportunity (phase 0) opens its phase 0", () => {
    render(<PortfolioTable rows={ROWS} />);
    expect(screen.getByRole("link", { name: /PRY-EJ-905/ })).toHaveAttribute("href", "/projects/PRY-EJ-905/phase/0");
  });

  // RGB-11 fix F2: the scroll container is itself a tab stop (keyboard users can scroll), so the first
  // Tab lands on it and the row links follow; the original expectation (links only) is kept after it.
  it("keyboard: Tab visits the scroll region, then one link per row in order, with a visible focus ring", async () => {
    render(<PortfolioTable rows={ROWS} />);
    await userEvent.tab();
    expect(screen.getByRole("region", { name: "Tabla de la cartera" })).toHaveFocus();
    for (const r of ROWS) {
      await userEvent.tab();
      expect(screen.getByRole("link", { name: new RegExp(r.code) })).toHaveFocus();
    }
    expect(screen.getAllByRole("link")[0].className).toMatch(/focus-visible:/);
  });

  it("no accessibility violations", async () => {
    const { container } = render(
      <main>
        <PortfolioTable rows={ROWS} />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
