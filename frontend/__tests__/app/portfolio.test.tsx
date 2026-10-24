import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { fetchPortfolio } from "@/lib/portfolio";
import { TRAFFIC_LIGHT_LABEL, consumptionPercent, consumptionTrafficLight, fetchTimingPlan } from "@/lib/timing";
import PortfolioPage, { metadata } from "@/app/portfolio/page";

describe("/portfolio", () => {
  it("has the title «Cartera» in the metadata", () => {
    expect(metadata.title).toBe("Cartera");
  });

  it("renders PageHead with a single h1 and its description", async () => {
    render(<PortfolioPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Cartera" })).toBeInTheDocument();
    expect(screen.getByText("Visión general de los proyectos activos y su estado.")).toBeInTheDocument();
    await screen.findByRole("table");
  });

  it("renders the view: summary, filters and the sample projects linked to their current phase", async () => {
    render(<PortfolioPage />);
    expect(await screen.findByRole("table", { name: "Proyectos de la cartera" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Resumen de la cartera" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Filtros de la cartera" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /PRY-EJ-001/ })).toHaveAttribute("href", "/projects/PRY-EJ-001/phase/3");
    expect(screen.queryByText("Aún no hay proyectos en la cartera")).not.toBeInTheDocument();
  });

  it("no accessibility violations once loaded", async () => {
    const { container } = render(
      <main>
        <PortfolioPage />
      </main>,
    );
    await screen.findByRole("table");
    expect(await axe(container)).toHaveNoViolations();
  });
});

// RGB-23: the weeks and the light of each row are those of «Plan y tiempos» (/projects/{code}/plan-and-timing).
describe("/portfolio phase weeks match «Plan y tiempos» (RGB-23)", () => {
  it("every row shows the weeks, the light and the bar colour of its current phase in the plan", async () => {
    render(<PortfolioPage />);
    await screen.findByRole("table", { name: "Proyectos de la cartera" });
    const rows = await fetchPortfolio();
    const tokens = { green: "bg-ok", amber: "bg-warn", red: "bg-bad" } as const;
    let withPlan = 0;
    for (const r of rows) {
      const tr = screen.getByRole("link", { name: new RegExp(r.code) }).closest("tr")!;
      const plan = await fetchTimingPlan(r.code);
      const view = within(tr);
      if (!plan) {
        expect(view.getByText("Sin plan hasta promover")).toBeInTheDocument();
        expect(view.queryByRole("progressbar")).not.toBeInTheDocument();
        continue;
      }
      withPlan += 1;
      const current = plan.phases.find((p) => p.phase === plan.currentPhase)!;
      expect(view.getByText(`${current.activeWeeks} / ${current.plannedWeeks} sem.`)).toBeInTheDocument();
      const bar = view.getByRole("progressbar");
      expect(bar).toHaveAttribute("aria-valuetext", `${consumptionPercent(current.activeWeeks, current.plannedWeeks)} % del plan`);
      const light = consumptionTrafficLight(current.activeWeeks, current.plannedWeeks);
      if (plan.activePause) {
        expect(view.getByText("Reloj parado")).toBeInTheDocument();
        expect(view.getByText("En pausa")).toBeInTheDocument();
        expect(bar.firstElementChild).toHaveClass("bg-off");
      } else {
        expect(view.getByText(TRAFFIC_LIGHT_LABEL[light])).toBeInTheDocument();
        expect(bar.firstElementChild).toHaveClass(tokens[light]);
      }
    }
    expect(withPlan).toBeGreaterThanOrEqual(5);
  });
});
