import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { TimingTable } from "@/components/timing/TimingTable";
import { PHASES } from "@/lib/phases";
import type { PlannedPhase, PhaseTiming } from "@/lib/timing";

const PLAN = [2, 3, 5, 6, 8, 36, 4];
const ACTIVE = [3, 4, 4, 0, 0, 0, 0];
const PAUSED = [0, 3, 1, 0, 0, 0, 0];

function phases(active: readonly number[] = ACTIVE, paused: readonly number[] = PAUSED): PhaseTiming[] {
  return PLAN.map((p, i) => ({
    phase: (i + 1) as PlannedPhase,
    plannedWeeks: p,
    activeWeeks: active[i],
    pausedWeeks: paused[i],
  }));
}

function rows() {
  return screen.getAllByRole("row").slice(1); // without the header
}
function row(n: number) {
  return rows()[n - 1];
}
const headers = () => screen.getAllByRole("columnheader").map((h) => h.textContent?.trim());

describe("TimingTable", () => {
  it("has the columns Fase, Plan, Activas, Pausa, Estado and Consumo", () => {
    render(<TimingTable phases={phases()} currentPhase={3} />);
    expect(headers()).toEqual(["Fase", "Plan", "Activas", "Pausa", "Estado", "Consumo"]);
  });

  it("has 7 rows, phases 1 to 7 in order, with the name of each phase", () => {
    render(<TimingTable phases={phases()} currentPhase={3} />);
    expect(rows()).toHaveLength(7);
    rows().forEach((f, i) => expect(f).toHaveTextContent(PHASES[i + 1].name));
    expect(screen.queryByText(PHASES[0].name)).not.toBeInTheDocument();
  });

  it("shows plan, active and pause of each phase as they are", () => {
    render(<TimingTable phases={phases()} currentPhase={3} />);
    rows().forEach((f, i) => {
      const cells = within(f).getAllByRole("cell");
      expect(cells[1]).toHaveTextContent(new RegExp(`^\\s*${PLAN[i]}\\b`));
      expect(cells[2]).toHaveTextContent(new RegExp(`^\\s*${ACTIVE[i]}\\b`));
      expect(cells[3]).toHaveTextContent(new RegExp(`^\\s*${PAUSED[i]}\\b`));
    });
  });

  it("Estado: Hecha before the current one, Actual on the current one, Pendiente after", () => {
    render(<TimingTable phases={phases()} currentPhase={3} />);
    const states = rows().map((f) => within(f).getAllByRole("cell")[4].textContent?.trim());
    expect(states).toEqual(["Hecha", "Hecha", "Actual", "Pendiente", "Pendiente", "Pendiente", "Pendiente"]);
  });

  it.each([
    [1, ["Actual", "Pendiente", "Pendiente", "Pendiente", "Pendiente", "Pendiente", "Pendiente"]],
    [7, ["Hecha", "Hecha", "Hecha", "Hecha", "Hecha", "Hecha", "Actual"]],
  ] as const)("Estado with current phase %i", (current, expected) => {
    render(<TimingTable phases={phases()} currentPhase={current} />);
    const states = rows().map((f) => within(f).getAllByRole("cell")[4].textContent?.trim());
    expect(states).toEqual(expected);
  });

  it("each row has a progress bar with values 0..100, value = percentage and phase name", () => {
    render(<TimingTable phases={phases()} currentPhase={3} />);
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(7);
    const pct = [150, 133, 80, 0, 0, 0, 0];
    bars.forEach((b, i) => {
      expect(b).toHaveAttribute("aria-valuemin", "0");
      expect(b).toHaveAttribute("aria-valuemax", "100");
      expect(b).toHaveAttribute("aria-valuenow", String(pct[i]));
      expect(b).toHaveAccessibleName(new RegExp(PHASES[i + 1].name));
      expect(within(rows()[i]).getByRole("progressbar")).toBe(b);
    });
  });

  it("the percentage is shown as text next to the bar", () => {
    render(<TimingTable phases={phases()} currentPhase={3} />);
    expect(row(1).textContent).toMatch(/150\s?%/);
    expect(row(2).textContent).toMatch(/133\s?%/);
    expect(row(3).textContent).toMatch(/80\s?%/);
    expect(row(4).textContent).toMatch(/(^|\D)0\s?%/);
  });

  it("above 100 % the bar keeps the real accessible value, but no visual measure goes past 100 %", () => {
    render(<TimingTable phases={phases()} currentPhase={3} />);
    const bar = within(row(1)).getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "150");
    // Plan ambiguity: it does not fix how it is limited (style.width, transform, class). We check
    // that no inline width of the bar or its children exceeds 100 %.
    const widths = [bar, ...Array.from(bar.querySelectorAll<HTMLElement>("*"))]
      .map((el) => el.style.width)
      .filter((w) => w.endsWith("%"))
      .map((w) => parseFloat(w));
    for (const w of widths) expect(w).toBeLessThanOrEqual(100);
  });

  it("rows with active > 0: the traffic-light label appears as text (red, red, amber)", () => {
    render(<TimingTable phases={phases()} currentPhase={3} />);
    expect(within(row(1)).getByText("Plan superado")).toBeInTheDocument();
    expect(within(row(2)).getByText("Plan superado")).toBeInTheDocument();
    expect(within(row(3)).getByText("Atención")).toBeInTheDocument();
    expect(within(row(1)).queryByText("Atención")).not.toBeInTheDocument();
    expect(within(row(3)).queryByText("Plan superado")).not.toBeInTheDocument();
  });

  it("a green row with active > 0 shows «En plazo»", () => {
    render(<TimingTable phases={phases([1, 1, 1, 0, 0, 0, 0])} currentPhase={3} />);
    expect(within(row(2)).getByText("En plazo")).toBeInTheDocument();
    expect(within(row(3)).getByText("En plazo")).toBeInTheDocument();
  });

  it("a phase at the exact plan limit (100 %) shows «Atención», not «Plan superado»", () => {
    render(<TimingTable phases={phases([2, 3, 5, 0, 0, 0, 0])} currentPhase={4} />);
    for (const n of [1, 2, 3]) {
      expect(within(row(n)).getByText("Atención")).toBeInTheDocument();
      expect(within(row(n)).queryByText("Plan superado")).not.toBeInTheDocument();
    }
  });

  it("does not depend on its own total calculations: it only paints what it receives (no invented totals row)", () => {
    render(<TimingTable phases={phases()} currentPhase={3} />);
    expect(screen.getAllByRole("row")).toHaveLength(8);
  });

  it("no accessibility violations", async () => {
    const { container } = render(<TimingTable phases={phases()} currentPhase={3} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
