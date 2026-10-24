import { render, screen } from "@testing-library/react";
import { TimingTable } from "@/components/timing/TimingTable";
import type { PhaseTiming } from "@/lib/timing";

// Regresión del Tester: fronteras del semáforo en la UI con plan 100 (79/80/100/101 %).
const CASES: [number, string, string][] = [
  [79, "79 %", "En plazo"],
  [80, "80 %", "Atención"],
  [100, "100 %", "Atención"],
  [101, "101 %", "Plan superado"],
];

describe("TablaTiempos · fronteras del semáforo en pantalla", () => {
  it.each(CASES)("%i activas de 100: %s y %s", (active, pct, label) => {
    const phases: PhaseTiming[] = [{ phase: 1, plannedWeeks: 100, activeWeeks: active, pausedWeeks: 0 }];
    render(<TimingTable phases={phases} currentPhase={1} />);
    expect(screen.getByText(pct)).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", String(active));
  });

  it("el redondeo no cambia el semáforo: 79,6 % se muestra 80 % pero sigue en plazo", () => {
    const phases: PhaseTiming[] = [{ phase: 1, plannedWeeks: 500, activeWeeks: 398, pausedWeeks: 0 }];
    render(<TimingTable phases={phases} currentPhase={1} />);
    expect(screen.getByText("80 %")).toBeInTheDocument();
    expect(screen.getByText("En plazo")).toBeInTheDocument();
  });
});
