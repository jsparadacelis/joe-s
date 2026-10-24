import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { TimingSummary } from "@/components/timing/TimingSummary";
import type { TimingPlan } from "@/lib/timing";

const PLAN: readonly number[] = [2, 3, 5, 6, 8, 36, 4];
const ACT: readonly number[] = [3, 4, 4, 0, 0, 0, 0];
const PAU: readonly number[] = [0, 3, 1, 0, 0, 0, 0];

function plan(extra: Partial<TimingPlan> = {}): TimingPlan {
  return {
    code: "PRY-EJ-001",
    currentPhase: 3,
    phases: PLAN.map((p, i) => ({
      phase: (i + 1) as 1,
      plannedWeeks: p,
      activeWeeks: ACT[i],
      pausedWeeks: PAU[i],
    })),
    pauses: [],
    activePause: null,
    totalActiveWeeks: 11,
    totalPlannedWeeks: 64,
    totalPausedWeeks: 4,
    calendarioSemanas: 15,
    deviationWeeks: 1,
    ...extra,
  };
}

const text = () => document.body.textContent ?? "";

describe("ResumenTiempos", () => {
  it("muestra los valores del servicio tal cual", () => {
    render(<TimingSummary plan={plan()} />);
    expect(screen.getByText(/11\s*\/\s*64\s*sem/)).toBeInTheDocument();
    expect(screen.getByText(/4\s*sem en pausa/)).toBeInTheDocument();
    expect(screen.getByText(/15\s*sem de calendario/)).toBeInTheDocument();
    expect(screen.getByText(/\+1\s*sem de desviación/)).toBeInTheDocument();
  });

  it("no recalcula: con totales incoherentes con las filas muestra los totales dados", () => {
    render(
      <TimingSummary
        plan={plan({
          totalActiveWeeks: 27,
          totalPlannedWeeks: 90,
          totalPausedWeeks: 9,
          calendarioSemanas: 41,
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

  it("desviación negativa muestra el signo menos (adelanto)", () => {
    render(<TimingSummary plan={plan({ deviationWeeks: -2 })} />);
    expect(screen.getByText(/[-−]2\s*sem de desviación/)).toBeInTheDocument();
    expect(text()).not.toMatch(/\+[-−]?2\s*sem de desviación/);
  });

  it("desviación cero se muestra como 0, sin signo más", () => {
    render(<TimingSummary plan={plan({ deviationWeeks: 0 })} />);
    expect(screen.getByText(/(^|[^+\d-])0\s*sem de desviación/)).toBeInTheDocument();
    expect(text()).not.toMatch(/\+0\s*sem/);
  });

  it("muestra la fase actual con su porcentaje de consumo y la etiqueta del semáforo (fase 3: 4/5 = 80 %, Atención)", () => {
    render(<TimingSummary plan={plan()} />);
    expect(text()).toMatch(/Anteproyecto/);
    expect(text()).toMatch(/80\s?%/);
    expect(screen.getByText("Atención")).toBeInTheDocument();
  });

  it("fase actual por encima del plan: porcentaje real y «Plan superado»", () => {
    const phases = plan().phases.map((f) => (f.phase === 3 ? { ...f, activeWeeks: 6 } : f));
    render(<TimingSummary plan={plan({ phases })} />);
    expect(text()).toMatch(/120\s?%/);
    expect(screen.getByText("Plan superado")).toBeInTheDocument();
  });

  it("fase actual por debajo del 80 %: «En plazo»", () => {
    const phases = plan().phases.map((f) => (f.phase === 3 ? { ...f, activeWeeks: 1 } : f));
    render(<TimingSummary plan={plan({ phases })} />);
    expect(text()).toMatch(/20\s?%/);
    expect(screen.getByText("En plazo")).toBeInTheDocument();
  });

  it("sin pausa activa no hay aviso", () => {
    render(<TimingSummary plan={plan()} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("con pausa activa muestra un aviso (role status) con motivo y reanudación prevista", () => {
    render(
      <TimingSummary
        plan={plan({
          activePause: { from: "2026-09-01", motivo: "authority-wait", expectedResumption: "2026-12-14" },
        })}
      />,
    );
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Espera de organismo");
    // El formato de la fecha no lo fija el plan: ISO, dd/mm/aaaa o «14 de diciembre de 2026».
    expect(notice.textContent).toMatch(/2026-12-14|14\/12\/2026|14 de diciembre( de 2026)?/i);
    expect(notice).toHaveTextContent(/pausa/i);
  });

  it.each([
    ["client-wait", "Espera del cliente"],
    ["internal-decision", "Decisión interna"],
    ["other", "Otra"],
  ] as const)("el aviso de pausa muestra la etiqueta en español del motivo %s", (motivo, label) => {
    render(
      <TimingSummary
        plan={plan({ activePause: { from: "2026-09-01", motivo, expectedResumption: "2026-12-14" } })}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(label);
    expect(screen.getByRole("status")).not.toHaveTextContent(motivo.includes("-") ? motivo : "__nada__");
  });

  it.each([
    ["sin pausa", null],
    ["con pausa activa", { from: "2026-09-01", motivo: "authority-wait", expectedResumption: "2026-12-14" }],
  ] as const)("sin violaciones de accesibilidad %s", async (_n, activePause) => {
    const { container } = render(<TimingSummary plan={plan({ activePause: activePause as TimingPlan["activePause"] })} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
