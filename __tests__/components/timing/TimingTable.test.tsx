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
  return screen.getAllByRole("row").slice(1); // sin la cabecera
}
function row(n: number) {
  return rows()[n - 1];
}
const headers = () => screen.getAllByRole("columnheader").map((h) => h.textContent?.trim());

describe("TablaTiempos", () => {
  it("tiene las columnas Fase, Plan, Activas, Pausa, Estado y Consumo", () => {
    render(<TimingTable phases={phases()} currentPhase={3} />);
    expect(headers()).toEqual(["Fase", "Plan", "Activas", "Pausa", "Estado", "Consumo"]);
  });

  it("tiene 7 filas, fases 1 a 7 en orden, con el nombre de cada fase", () => {
    render(<TimingTable phases={phases()} currentPhase={3} />);
    expect(rows()).toHaveLength(7);
    rows().forEach((f, i) => expect(f).toHaveTextContent(PHASES[i + 1].name));
    expect(screen.queryByText(PHASES[0].name)).not.toBeInTheDocument();
  });

  it("muestra plan, activas y pausa de cada fase tal cual", () => {
    render(<TimingTable phases={phases()} currentPhase={3} />);
    rows().forEach((f, i) => {
      const cells = within(f).getAllByRole("cell");
      expect(cells[1]).toHaveTextContent(new RegExp(`^\\s*${PLAN[i]}\\b`));
      expect(cells[2]).toHaveTextContent(new RegExp(`^\\s*${ACTIVE[i]}\\b`));
      expect(cells[3]).toHaveTextContent(new RegExp(`^\\s*${PAUSED[i]}\\b`));
    });
  });

  it("Estado: Hecha antes de la actual, Actual en la actual, Pendiente después", () => {
    render(<TimingTable phases={phases()} currentPhase={3} />);
    const states = rows().map((f) => within(f).getAllByRole("cell")[4].textContent?.trim());
    expect(states).toEqual(["Hecha", "Hecha", "Actual", "Pendiente", "Pendiente", "Pendiente", "Pendiente"]);
  });

  it.each([
    [1, ["Actual", "Pendiente", "Pendiente", "Pendiente", "Pendiente", "Pendiente", "Pendiente"]],
    [7, ["Hecha", "Hecha", "Hecha", "Hecha", "Hecha", "Hecha", "Actual"]],
  ] as const)("Estado con fase actual %i", (current, expected) => {
    render(<TimingTable phases={phases()} currentPhase={current} />);
    const states = rows().map((f) => within(f).getAllByRole("cell")[4].textContent?.trim());
    expect(states).toEqual(expected);
  });

  it("cada fila tiene una barra de progreso con valores 0..100, valor = porcentaje y nombre de la fase", () => {
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

  it("el porcentaje se muestra en texto junto a la barra", () => {
    render(<TimingTable phases={phases()} currentPhase={3} />);
    expect(row(1).textContent).toMatch(/150\s?%/);
    expect(row(2).textContent).toMatch(/133\s?%/);
    expect(row(3).textContent).toMatch(/80\s?%/);
    expect(row(4).textContent).toMatch(/(^|\D)0\s?%/);
  });

  it("con más del 100 % la barra conserva el valor accesible real, pero ninguna medida visual pasa del 100 %", () => {
    render(<TimingTable phases={phases()} currentPhase={3} />);
    const bar = within(row(1)).getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "150");
    // Ambigüedad del plan: no fija cómo se limita (style.width, transform, clase). Se comprueba
    // que ningún ancho en línea de la barra o sus hijos supere el 100 %.
    const widths = [bar, ...Array.from(bar.querySelectorAll<HTMLElement>("*"))]
      .map((el) => el.style.width)
      .filter((w) => w.endsWith("%"))
      .map((w) => parseFloat(w));
    for (const w of widths) expect(w).toBeLessThanOrEqual(100);
  });

  it("filas con activas > 0: la etiqueta del semáforo aparece como texto (rojo, rojo, ámbar)", () => {
    render(<TimingTable phases={phases()} currentPhase={3} />);
    expect(within(row(1)).getByText("Plan superado")).toBeInTheDocument();
    expect(within(row(2)).getByText("Plan superado")).toBeInTheDocument();
    expect(within(row(3)).getByText("Atención")).toBeInTheDocument();
    expect(within(row(1)).queryByText("Atención")).not.toBeInTheDocument();
    expect(within(row(3)).queryByText("Plan superado")).not.toBeInTheDocument();
  });

  it("una fila verde con activas > 0 muestra «En plazo»", () => {
    render(<TimingTable phases={phases([1, 1, 1, 0, 0, 0, 0])} currentPhase={3} />);
    expect(within(row(2)).getByText("En plazo")).toBeInTheDocument();
    expect(within(row(3)).getByText("En plazo")).toBeInTheDocument();
  });

  it("en una fase en el límite exacto del plan (100 %) muestra «Atención», no «Plan superado»", () => {
    render(<TimingTable phases={phases([2, 3, 5, 0, 0, 0, 0])} currentPhase={4} />);
    for (const n of [1, 2, 3]) {
      expect(within(row(n)).getByText("Atención")).toBeInTheDocument();
      expect(within(row(n)).queryByText("Plan superado")).not.toBeInTheDocument();
    }
  });

  it("no depende de cálculos propios del total: solo pinta lo que recibe (sin fila de totales inventada)", () => {
    render(<TimingTable phases={phases()} currentPhase={3} />);
    expect(screen.getAllByRole("row")).toHaveLength(8);
  });

  it("sin violaciones de accesibilidad", async () => {
    const { container } = render(<TimingTable phases={phases()} currentPhase={3} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
