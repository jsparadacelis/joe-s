import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { PortfolioTable } from "@/components/portfolio/PortfolioTable";
import type { PortfolioRow } from "@/lib/portfolio";
import { makeRow } from "../../helpers/portfolio-rows";

function rowOf(code: string): HTMLElement {
  const row = screen.getByRole("link", { name: new RegExp(code) }).closest("tr");
  if (!row) throw new Error(`no row for ${code}`);
  return row;
}

const paused = (extra: Partial<PortfolioRow> = {}) =>
  makeRow({
    code: "PRY-2026-050",
    status: "paused",
    phase: 2,
    pause: { reason: "client-wait", expectedResumption: "2026-11-09", overdue: false, daysOverdue: 0 },
    ...extra,
  });

const overduePause = (days: number, date = "2026-10-21") => ({
  reason: "other" as const,
  expectedResumption: date,
  overdue: true,
  daysOverdue: days,
});

describe("PortfolioTable · paused rows (RGB-21)", () => {
  it("shows the «En pausa» chip and «Reanudación prevista el dd/mm/aaaa»", () => {
    render(<PortfolioTable rows={[paused()]} />);
    const row = within(rowOf("PRY-2026-050"));
    expect(row.getByText("En pausa")).toBeInTheDocument();
    expect(row.getByText("Reanudación prevista el 09/11/2026")).toBeInTheDocument();
    expect(row.queryByText(/Vencida/)).not.toBeInTheDocument();
  });

  it("an overdue pause adds «Vencida hace N días» as text, singular for one day", () => {
    const { rerender } = render(<PortfolioTable rows={[paused({ pause: overduePause(3) })]} />);
    expect(within(rowOf("PRY-2026-050")).getByText("Vencida hace 3 días")).toBeInTheDocument();
    rerender(<PortfolioTable rows={[paused({ pause: overduePause(1, "2026-10-23") })]} />);
    expect(within(rowOf("PRY-2026-050")).getByText("Vencida hace 1 día")).toBeInTheDocument();
  });

  it("status paused with pause null shows only the chip", () => {
    render(<PortfolioTable rows={[paused({ pause: null })]} />);
    const row = within(rowOf("PRY-2026-050"));
    expect(row.getByText("En pausa")).toBeInTheDocument();
    expect(row.queryByText(/Reanudación prevista/)).not.toBeInTheDocument();
    expect(row.queryByText(/Vencida/)).not.toBeInTheDocument();
  });

  it("a non-paused row never shows pause texts", () => {
    render(<PortfolioTable rows={[makeRow({ code: "PRY-2026-051", status: "green" })]} />);
    expect(screen.queryByText(/Reanudación prevista/)).not.toBeInTheDocument();
  });

  it("keeps the project link and the scroll region", () => {
    render(<PortfolioTable rows={[paused()]} />);
    expect(rowOf("PRY-2026-050").querySelector("a")).toHaveAttribute("href", "/projects/PRY-2026-050/phase/2");
    expect(screen.getByRole("region", { name: "Tabla de la cartera" })).toHaveAttribute("tabindex", "0");
  });

  it("no accessibility violations", async () => {
    const { container } = render(
      <main>
        <PortfolioTable rows={[paused(), paused({ code: "PRY-2026-052", pause: overduePause(4, "2026-10-20") })]} />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
