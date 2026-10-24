import { render, screen } from "@testing-library/react";
import { TimingTable } from "@/components/timing/TimingTable";
import type { PhaseTiming } from "@/lib/timing";

// Tester regression: traffic-light boundaries in the UI with plan 100 (79/80/100/101 %).
const CASES: [number, string, string][] = [
  [79, "79 %", "En plazo"],
  [80, "80 %", "Atención"],
  [100, "100 %", "Atención"],
  [101, "101 %", "Plan superado"],
];

describe("TimingTable · traffic-light boundaries on screen", () => {
  it.each(CASES)("%i active of 100: %s and %s", (active, pct, label) => {
    const phases: PhaseTiming[] = [{ phase: 1, plannedWeeks: 100, activeWeeks: active, pausedWeeks: 0 }];
    render(<TimingTable phases={phases} currentPhase={1} />);
    expect(screen.getByText(pct)).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", String(active));
  });

  it("rounding does not change the traffic light: 79.6 % is shown as 80 % but is still on time", () => {
    const phases: PhaseTiming[] = [{ phase: 1, plannedWeeks: 500, activeWeeks: 398, pausedWeeks: 0 }];
    render(<TimingTable phases={phases} currentPhase={1} />);
    expect(screen.getByText("80 %")).toBeInTheDocument();
    expect(screen.getByText("En plazo")).toBeInTheDocument();
  });
});
