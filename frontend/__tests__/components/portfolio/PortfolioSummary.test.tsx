import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { PortfolioSummary } from "@/components/portfolio/PortfolioSummary";
import type { PortfolioSummary as Summary } from "@/lib/portfolio";

const SUMMARY: Summary = { active: 12, atRisk: 3, milestonesIn7Days: 4, staleSheets: 5 };

/** Value (dd) of the stat whose label (dt) is `label`; each stat is a div > dt + dd. */
function valueOf(label: string): string {
  const stat = screen.getByText(label).closest("div");
  return stat?.querySelector("dd")?.textContent ?? "";
}

describe("PortfolioSummary", () => {
  it("is a region named «Resumen de la cartera»", () => {
    render(<PortfolioSummary summary={SUMMARY} />);
    expect(screen.getByRole("region", { name: "Resumen de la cartera" })).toBeInTheDocument();
  });

  it("shows the four figures with their Spanish labels", () => {
    render(<PortfolioSummary summary={SUMMARY} />);
    const region = screen.getByRole("region", { name: "Resumen de la cartera" });
    expect(within(region).getAllByRole("term").map((t) => t.textContent)).toEqual([
      "Proyectos activos",
      "En riesgo",
      "Hitos en 7 días",
      "Fichas desactualizadas",
    ]);
    expect(valueOf("Proyectos activos")).toBe("12");
    expect(valueOf("En riesgo")).toBe("3");
    expect(valueOf("Hitos en 7 días")).toBe("4");
    expect(valueOf("Fichas desactualizadas")).toBe("5");
  });

  it("shows zeros as 0 (not empty or a dash)", () => {
    render(<PortfolioSummary summary={{ active: 0, atRisk: 0, milestonesIn7Days: 0, staleSheets: 0 }} />);
    expect(valueOf("Proyectos activos")).toBe("0");
    expect(valueOf("En riesgo")).toBe("0");
    expect(valueOf("Hitos en 7 días")).toBe("0");
    expect(valueOf("Fichas desactualizadas")).toBe("0");
  });

  it("no accessibility violations", async () => {
    const { container } = render(
      <main>
        <PortfolioSummary summary={SUMMARY} />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
