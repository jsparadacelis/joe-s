import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { ResumenTiempos } from "@/components/tiempos/ResumenTiempos";
import type { PlanTiempos } from "@/lib/tiempos";

const PLAN: readonly number[] = [2, 3, 5, 6, 8, 36, 4];
const ACT: readonly number[] = [3, 4, 4, 0, 0, 0, 0];
const PAU: readonly number[] = [0, 3, 1, 0, 0, 0, 0];

function plan(extra: Partial<PlanTiempos> = {}): PlanTiempos {
  return {
    codigo: "PRY-EJ-001",
    faseActual: 3,
    fases: PLAN.map((p, i) => ({
      fase: (i + 1) as 1,
      planSemanas: p,
      activasSemanas: ACT[i],
      pausaSemanas: PAU[i],
    })),
    pausas: [],
    pausaActiva: null,
    totalActivasSemanas: 11,
    totalPlanSemanas: 64,
    totalPausaSemanas: 4,
    calendarioSemanas: 15,
    desviacionSemanas: 1,
    ...extra,
  };
}

const texto = () => document.body.textContent ?? "";

describe("ResumenTiempos", () => {
  it("muestra los valores del servicio tal cual", () => {
    render(<ResumenTiempos plan={plan()} />);
    expect(screen.getByText(/11\s*\/\s*64\s*sem/)).toBeInTheDocument();
    expect(screen.getByText(/4\s*sem en pausa/)).toBeInTheDocument();
    expect(screen.getByText(/15\s*sem de calendario/)).toBeInTheDocument();
    expect(screen.getByText(/\+1\s*sem de desviación/)).toBeInTheDocument();
  });

  it("no recalcula: con totales incoherentes con las filas muestra los totales dados", () => {
    render(
      <ResumenTiempos
        plan={plan({
          totalActivasSemanas: 27,
          totalPlanSemanas: 90,
          totalPausaSemanas: 9,
          calendarioSemanas: 41,
          desviacionSemanas: 5,
        })}
      />,
    );
    expect(screen.getByText(/27\s*\/\s*90\s*sem/)).toBeInTheDocument();
    expect(screen.getByText(/9\s*sem en pausa/)).toBeInTheDocument();
    expect(screen.getByText(/41\s*sem de calendario/)).toBeInTheDocument();
    expect(screen.getByText(/\+5\s*sem de desviación/)).toBeInTheDocument();
    expect(texto()).not.toMatch(/11\s*\/\s*64/);
    expect(texto()).not.toMatch(/15\s*sem de calendario/);
  });

  it("desviación negativa muestra el signo menos (adelanto)", () => {
    render(<ResumenTiempos plan={plan({ desviacionSemanas: -2 })} />);
    expect(screen.getByText(/[-−]2\s*sem de desviación/)).toBeInTheDocument();
    expect(texto()).not.toMatch(/\+[-−]?2\s*sem de desviación/);
  });

  it("desviación cero se muestra como 0, sin signo más", () => {
    render(<ResumenTiempos plan={plan({ desviacionSemanas: 0 })} />);
    expect(screen.getByText(/(^|[^+\d-])0\s*sem de desviación/)).toBeInTheDocument();
    expect(texto()).not.toMatch(/\+0\s*sem/);
  });

  it("muestra la fase actual con su porcentaje de consumo y la etiqueta del semáforo (fase 3: 4/5 = 80 %, Atención)", () => {
    render(<ResumenTiempos plan={plan()} />);
    expect(texto()).toMatch(/Anteproyecto/);
    expect(texto()).toMatch(/80\s?%/);
    expect(screen.getByText("Atención")).toBeInTheDocument();
  });

  it("fase actual por encima del plan: porcentaje real y «Plan superado»", () => {
    const fases = plan().fases.map((f) => (f.fase === 3 ? { ...f, activasSemanas: 6 } : f));
    render(<ResumenTiempos plan={plan({ fases })} />);
    expect(texto()).toMatch(/120\s?%/);
    expect(screen.getByText("Plan superado")).toBeInTheDocument();
  });

  it("fase actual por debajo del 80 %: «En plazo»", () => {
    const fases = plan().fases.map((f) => (f.fase === 3 ? { ...f, activasSemanas: 1 } : f));
    render(<ResumenTiempos plan={plan({ fases })} />);
    expect(texto()).toMatch(/20\s?%/);
    expect(screen.getByText("En plazo")).toBeInTheDocument();
  });

  it("sin pausa activa no hay aviso", () => {
    render(<ResumenTiempos plan={plan()} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("con pausa activa muestra un aviso (role status) con motivo y reanudación prevista", () => {
    render(
      <ResumenTiempos
        plan={plan({
          pausaActiva: { desde: "2026-09-01", motivo: "espera-organismo", reanudacionPrevista: "2026-12-14" },
        })}
      />,
    );
    const aviso = screen.getByRole("status");
    expect(aviso).toHaveTextContent("Espera de organismo");
    // El formato de la fecha no lo fija el plan: ISO, dd/mm/aaaa o «14 de diciembre de 2026».
    expect(aviso.textContent).toMatch(/2026-12-14|14\/12\/2026|14 de diciembre( de 2026)?/i);
    expect(aviso).toHaveTextContent(/pausa/i);
  });

  it.each([
    ["espera-cliente", "Espera del cliente"],
    ["decision-interna", "Decisión interna"],
    ["otra", "Otra"],
  ] as const)("el aviso de pausa muestra la etiqueta en español del motivo %s", (motivo, etiqueta) => {
    render(
      <ResumenTiempos
        plan={plan({ pausaActiva: { desde: "2026-09-01", motivo, reanudacionPrevista: "2026-12-14" } })}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(etiqueta);
    expect(screen.getByRole("status")).not.toHaveTextContent(motivo.includes("-") ? motivo : "__nada__");
  });

  it.each([
    ["sin pausa", null],
    ["con pausa activa", { desde: "2026-09-01", motivo: "espera-organismo", reanudacionPrevista: "2026-12-14" }],
  ] as const)("sin violaciones de accesibilidad %s", async (_n, pausaActiva) => {
    const { container } = render(<ResumenTiempos plan={plan({ pausaActiva: pausaActiva as PlanTiempos["pausaActiva"] })} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
