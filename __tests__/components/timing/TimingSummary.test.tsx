import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { TimingSummary } from "@/components/timing/TimingSummary";
import type { TimingPlan } from "@/lib/timing";

const PLAN: readonly number[] = [2, 3, 5, 6, 8, 36, 4];
const ACTIVE: readonly number[] = [3, 4, 4, 0, 0, 0, 0];
const PAUSED: readonly number[] = [0, 3, 1, 0, 0, 0, 0];

function plan(extra: Partial<TimingPlan> = {}): TimingPlan {
  return {
    code: "PRY-EJ-001",
    currentPhase: 3,
    phases: PLAN.map((p, i) => ({
      phase: (i + 1) as 1,
      plannedWeeks: p,
      activeWeeks: ACTIVE[i],
      pausedWeeks: PAUSED[i],
    })),
    pauses: [],
    activePause: null,
    totalActiveWeeks: 11,
    totalPlannedWeeks: 64,
    totalPausedWeeks: 4,
    calendarWeeks: 15,
    deviationWeeks: 1,
    ...extra,
  };
}

const text = () => document.body.textContent ?? "";

describe("TimingSummary", () => {
  it("shows the service values as they are", () => {
    render(<TimingSummary plan={plan()} />);
    expect(screen.getByText(/11\s*\/\s*64\s*sem/)).toBeInTheDocument();
    expect(screen.getByText(/4\s*sem en pausa/)).toBeInTheDocument();
    expect(screen.getByText(/15\s*sem de calendario/)).toBeInTheDocument();
    expect(screen.getByText(/\+1\s*sem de desviación/)).toBeInTheDocument();
  });

  it("does not recalculate: with totals inconsistent with the rows it shows the given totals", () => {
    render(
      <TimingSummary
        plan={plan({
          totalActiveWeeks: 27,
          totalPlannedWeeks: 90,
          totalPausedWeeks: 9,
          calendarWeeks: 41,
          deviationWeeks: 5,
        })}
      />,
    );
    expect(screen.getByText(/27\s*\/\s*90\s*sem/)).toBeInTheDocument();
    expect(screen.getByText(/9\s*sem en pausa/)).toBeInTheDocument();
    expect(screen.getByText(/41\s*sem de calendario/)).toBeInTheDocument();
    expect(screen.getByText(/\+5\s*sem de desviación/)).toBeInTheDocument();
    expect(text()).not.toMatch(/11\s*\/\s*64/);
    expect(text()).not.toMatch(/15\s*sem de calendario/);
  });

  it("negative deviation shows the minus sign (ahead of plan)", () => {
    render(<TimingSummary plan={plan({ deviationWeeks: -2 })} />);
    expect(screen.getByText(/[-−]2\s*sem de desviación/)).toBeInTheDocument();
    expect(text()).not.toMatch(/\+[-−]?2\s*sem de desviación/);
  });

  it("zero deviation is shown as 0, without a plus sign", () => {
    render(<TimingSummary plan={plan({ deviationWeeks: 0 })} />);
    expect(screen.getByText(/(^|[^+\d-])0\s*sem de desviación/)).toBeInTheDocument();
    expect(text()).not.toMatch(/\+0\s*sem/);
  });

  it("shows the current phase with its consumption percentage and the traffic-light label (phase 3: 4/5 = 80 %, Atención)", () => {
    render(<TimingSummary plan={plan()} />);
    expect(text()).toMatch(/Anteproyecto/);
    expect(text()).toMatch(/80\s?%/);
    expect(screen.getByText("Atención")).toBeInTheDocument();
  });

  it("current phase above the plan: real percentage and «Plan superado»", () => {
    const phases = plan().phases.map((f) => (f.phase === 3 ? { ...f, activeWeeks: 6 } : f));
    render(<TimingSummary plan={plan({ phases })} />);
    expect(text()).toMatch(/120\s?%/);
    expect(screen.getByText("Plan superado")).toBeInTheDocument();
  });

  it("current phase below 80 %: «En plazo»", () => {
    const phases = plan().phases.map((f) => (f.phase === 3 ? { ...f, activeWeeks: 1 } : f));
    render(<TimingSummary plan={plan({ phases })} />);
    expect(text()).toMatch(/20\s?%/);
    expect(screen.getByText("En plazo")).toBeInTheDocument();
  });

  it("without an active pause there is no notice", () => {
    render(<TimingSummary plan={plan()} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("with an active pause it shows a notice (role status) with reason and expected resumption", () => {
    render(
      <TimingSummary
        plan={plan({
          activePause: { from: "2026-09-01", reason: "authority-wait", expectedResumption: "2026-12-14" },
        })}
      />,
    );
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Espera de organismo");
    // The plan does not fix the date format: ISO, dd/mm/aaaa or «14 de diciembre de 2026».
    expect(notice.textContent).toMatch(/2026-12-14|14\/12\/2026|14 de diciembre( de 2026)?/i);
    expect(notice).toHaveTextContent(/pausa/i);
  });

  it.each([
    ["client-wait", "Espera del cliente"],
    ["internal-decision", "Decisión interna"],
    ["other", "Otra"],
  ] as const)("the pause notice shows the Spanish label of reason %s", (reason, label) => {
    render(
      <TimingSummary
        plan={plan({ activePause: { from: "2026-09-01", reason, expectedResumption: "2026-12-14" } })}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(label);
    expect(screen.getByRole("status")).not.toHaveTextContent(reason.includes("-") ? reason : "__nada__");
  });

  it.each([
    ["sin pausa", null],
    ["con pausa activa", { from: "2026-09-01", reason: "authority-wait", expectedResumption: "2026-12-14" }],
  ] as const)("no accessibility violations %s", async (_n, activePause) => {
    const { container } = render(<TimingSummary plan={plan({ activePause: activePause as TimingPlan["activePause"] })} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
