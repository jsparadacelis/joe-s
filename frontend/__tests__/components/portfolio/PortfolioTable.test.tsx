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

  // RGB-23: «Semanas de la fase» is inserted between «Fase» and «Semáforo» (eight columns now).
  it("has the eight columns in order", () => {
    render(<PortfolioTable rows={ROWS} />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual([
      "Proyecto",
      "Fase",
      "Semanas de la fase",
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
    ["unknown", "Sin calcular", "bg-off"],
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

describe("PortfolioTable phase weeks (RGB-23)", () => {
  const fill = (bar: HTMLElement) => bar.firstElementChild as HTMLElement;
  const barOf = (code: string) => within(rowOf(code)).getByRole("progressbar");

  it("shows «{active} / {plan} sem.» in the row", () => {
    render(<PortfolioTable rows={[makeRow({ phaseWeeks: { active: 4, planned: 5 }, status: "amber" })]} />);
    expect(within(rowOf("PRY-EJ-901")).getByText("4 / 5 sem.")).toBeInTheDocument();
  });

  it("the cell sits between «Fase» and «Semáforo»", () => {
    render(<PortfolioTable rows={[makeRow({ phase: 3, phaseWeeks: { active: 4, planned: 5 }, status: "amber" })]} />);
    const cells = within(rowOf("PRY-EJ-901")).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent("3. Anteproyecto");
    expect(cells[2]).toHaveTextContent("4 / 5 sem.");
    expect(cells[3]).toHaveTextContent("Atención");
  });

  it("the progress bar is named «{active} de {plan} semanas activas, {percent} % del plan»", () => {
    render(<PortfolioTable rows={[makeRow({ phaseWeeks: { active: 4, planned: 5 }, status: "amber" })]} />);
    expect(barOf("PRY-EJ-901")).toHaveAccessibleName("4 de 5 semanas activas, 80 % del plan");
  });

  it("exposes min 0, max 100, now and a text value with the percent", () => {
    render(<PortfolioTable rows={[makeRow({ phaseWeeks: { active: 4, planned: 5 }, status: "amber" })]} />);
    const bar = barOf("PRY-EJ-901");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-valuenow", "80");
    expect(bar).toHaveAttribute("aria-valuetext", "80 % del plan");
    expect(fill(bar).style.width).toBe("80%");
  });

  it("over the plan (113 %): valuenow is capped at 100, valuetext keeps the real percent, fill is capped", () => {
    render(<PortfolioTable rows={ROWS} />);
    const bar = barOf("PRY-EJ-903");
    expect(within(rowOf("PRY-EJ-903")).getByText("9 / 8 sem.")).toBeInTheDocument();
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(bar).toHaveAttribute("aria-valuetext", "113 % del plan");
    expect(bar).toHaveAccessibleName("9 de 8 semanas activas, 113 % del plan");
    expect(fill(bar).style.width).toBe("100%");
  });

  it.each([
    [{ active: 1, planned: 3 }, "green", "bg-ok"],
    [{ active: 4, planned: 5 }, "amber", "bg-warn"],
    [{ active: 5, planned: 5 }, "amber", "bg-warn"],
    [{ active: 9, planned: 8 }, "red", "bg-bad"],
  ] as const)("consumption %j is coloured %s with the %s token, never a loose colour", (phaseWeeks, status, token) => {
    render(<PortfolioTable rows={[makeRow({ status, phaseWeeks })]} />);
    const classes = fill(barOf("PRY-EJ-901")).className;
    expect(classes).toContain(token);
    expect(classes).not.toMatch(/#|rgb|\[/);
    expect(classes.match(/\bbg-(ok|warn|bad|off)\b/g)).toEqual([token]);
  });

  it("the colour comes from the consumption, not from the row status chip", () => {
    // Inconsistent on purpose: the bar must follow consumptionTrafficLight(active, plan).
    render(<PortfolioTable rows={[makeRow({ status: "green", phaseWeeks: { active: 9, planned: 8 } })]} />);
    expect(fill(barOf("PRY-EJ-901"))).toHaveClass("bg-bad");
  });

  it("the information is also text, not only colour: weeks text and percent in the name", () => {
    render(<PortfolioTable rows={ROWS.filter((r) => r.phaseWeeks)} />);
    for (const r of ROWS.filter((x) => x.phaseWeeks)) {
      const row = within(rowOf(r.code));
      expect(row.getByText(`${r.phaseWeeks!.active} / ${r.phaseWeeks!.planned} sem.`)).toBeInTheDocument();
      expect(row.getByRole("progressbar").getAttribute("aria-valuetext")).toMatch(/^\d+ % del plan$/);
    }
  });

  describe("paused (clock stopped)", () => {
    const pausedRow = () => makeRow({ code: "PRY-EJ-904", status: "paused", phaseWeeks: { active: 30, planned: 36 } });

    it("shows the frozen weeks and the text «Reloj parado»", () => {
      render(<PortfolioTable rows={[pausedRow()]} />);
      const row = within(rowOf("PRY-EJ-904"));
      expect(row.getByText("30 / 36 sem.")).toBeInTheDocument();
      expect(row.getByText("Reloj parado")).toBeInTheDocument();
    });

    it("the bar is not coloured as progress: neutral token only, no ok/warn/bad", () => {
      render(<PortfolioTable rows={[pausedRow()]} />);
      const classes = fill(barOf("PRY-EJ-904")).className;
      expect(classes).toContain("bg-off");
      expect(classes).not.toMatch(/\bbg-(ok|warn|bad)\b/);
    });

    it("the bar says it is stopped in its accessible name and keeps the frozen percent", () => {
      render(<PortfolioTable rows={[pausedRow()]} />);
      const bar = barOf("PRY-EJ-904");
      expect(bar).toHaveAccessibleName("30 de 36 semanas activas, reloj parado");
      expect(bar).toHaveAttribute("aria-valuenow", "83");
      expect(bar).toHaveAttribute("aria-valuetext", "83 % del plan");
    });

    it("«Reloj parado» appears only on paused rows", () => {
      render(<PortfolioTable rows={ROWS} />);
      expect(screen.getAllByText("Reloj parado")).toHaveLength(1);
      expect(within(rowOf("PRY-EJ-904")).getByText("Reloj parado")).toBeInTheDocument();
    });
  });

  describe("opportunities (no plan)", () => {
    it("show «Sin plan hasta promover», no progress bar and no weeks text", () => {
      render(<PortfolioTable rows={ROWS} />);
      const row = within(rowOf("PRY-EJ-905"));
      expect(row.getByText("Sin plan hasta promover")).toBeInTheDocument();
      expect(row.queryByRole("progressbar")).not.toBeInTheDocument();
      expect(row.queryByText(/sem\./)).not.toBeInTheDocument();
      expect(row.queryByText("Reloj parado")).not.toBeInTheDocument();
    });

    it("rows with a plan never show «Sin plan hasta promover»", () => {
      render(<PortfolioTable rows={ROWS} />);
      expect(screen.getAllByText("Sin plan hasta promover")).toHaveLength(1);
      expect(screen.getAllByRole("progressbar")).toHaveLength(ROWS.length - 1);
    });
  });

  it("the row still has a single link and the bar adds no tab stop", async () => {
    render(<PortfolioTable rows={ROWS} />);
    for (const r of ROWS) expect(within(rowOf(r.code)).getAllByRole("link")).toHaveLength(1);
    await userEvent.tab();
    for (const r of ROWS) {
      await userEvent.tab();
      expect(screen.getByRole("link", { name: new RegExp(r.code) })).toHaveFocus();
    }
  });

  it("the scroll region still wraps the table", () => {
    render(<PortfolioTable rows={ROWS} />);
    const region = screen.getByRole("region", { name: "Tabla de la cartera" });
    expect(region).toHaveClass("overflow-x-auto");
    expect(region).toContainElement(screen.getAllByRole("progressbar")[0]);
  });

  it("no accessibility violations with bars, paused and no-plan rows", async () => {
    const { container } = render(
      <main>
        <PortfolioTable rows={ROWS} />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

// RGB-13: states and nulls that come from the real API.
describe("PortfolioTable with API data (RGB-13)", () => {
  it("a milestone without a date shows its name and «Sin fecha», with no <time>", () => {
    render(<PortfolioTable rows={[makeRow({ nextMilestone: { name: "Kick-off", date: null } })]} />);
    const row = rowOf("PRY-EJ-901");
    expect(within(row).getByText("Kick-off")).toBeInTheDocument();
    expect(within(row).getByText("Sin fecha")).toBeInTheDocument();
    expect(row.querySelector("time")).toBeNull();
  });

  it("«Sin calcular» uses a neutral tone, not the warning or error ones", () => {
    render(<PortfolioTable rows={[makeRow({ status: "unknown", phaseWeeks: null })]} />);
    // Two texts say «Sin calcular» in the row (chip and weeks cell): the chip is the one with a dot.
    const dot = rowOf("PRY-EJ-901").querySelector('[aria-hidden="true"]');
    expect(dot).not.toHaveClass("bg-warn");
    expect(dot).not.toHaveClass("bg-bad");
  });

  it("no phase weeks: «Sin plan hasta promover» for an opportunity, «Sin calcular» for an unknown row", () => {
    render(
      <PortfolioTable
        rows={[
          makeRow({ code: "PRY-EJ-901", status: "no-plan", phase: 0, phaseWeeks: null }),
          makeRow({ code: "PRY-EJ-902", status: "unknown", phaseWeeks: null }),
          makeRow({ code: "PRY-EJ-903", status: "green", phaseWeeks: null }),
        ]}
      />,
    );
    expect(within(rowOf("PRY-EJ-901")).getByText("Sin plan hasta promover")).toBeInTheDocument();
    for (const code of ["PRY-EJ-902", "PRY-EJ-903"]) {
      const cell = within(rowOf(code));
      expect(cell.getByText("Sin calcular", { selector: "span.text-muted" })).toBeInTheDocument();
      expect(cell.queryByText("Sin plan hasta promover")).not.toBeInTheDocument();
      expect(cell.queryByRole("progressbar")).not.toBeInTheDocument();
    }
  });

  it("no accessibility violations with unknown rows and undated milestones", async () => {
    const { container } = render(
      <main>
        <PortfolioTable
          rows={[
            makeRow({ status: "unknown", phaseWeeks: null, nextMilestone: { name: "Kick-off", date: null } }),
          ]}
        />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
