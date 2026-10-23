import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { TablaTiempos } from "@/components/tiempos/TablaTiempos";
import { FASES } from "@/lib/fases";
import type { FaseConPlan, TiempoFase } from "@/lib/tiempos";

const PLAN = [2, 3, 5, 6, 8, 36, 4];
const ACT = [3, 4, 4, 0, 0, 0, 0];
const PAU = [0, 3, 1, 0, 0, 0, 0];

function fases(act: readonly number[] = ACT, pau: readonly number[] = PAU): TiempoFase[] {
  return PLAN.map((p, i) => ({
    fase: (i + 1) as FaseConPlan,
    planSemanas: p,
    activasSemanas: act[i],
    pausaSemanas: pau[i],
  }));
}

function filas() {
  return screen.getAllByRole("row").slice(1); // sin la cabecera
}
function fila(n: number) {
  return filas()[n - 1];
}
const cabeceras = () => screen.getAllByRole("columnheader").map((h) => h.textContent?.trim());

describe("TablaTiempos", () => {
  it("tiene las columnas Fase, Plan, Activas, Pausa, Estado y Consumo", () => {
    render(<TablaTiempos fases={fases()} faseActual={3} />);
    expect(cabeceras()).toEqual(["Fase", "Plan", "Activas", "Pausa", "Estado", "Consumo"]);
  });

  it("tiene 7 filas, fases 1 a 7 en orden, con el nombre de cada fase", () => {
    render(<TablaTiempos fases={fases()} faseActual={3} />);
    expect(filas()).toHaveLength(7);
    filas().forEach((f, i) => expect(f).toHaveTextContent(FASES[i + 1].nombre));
    expect(screen.queryByText(FASES[0].nombre)).not.toBeInTheDocument();
  });

  it("muestra plan, activas y pausa de cada fase tal cual", () => {
    render(<TablaTiempos fases={fases()} faseActual={3} />);
    filas().forEach((f, i) => {
      const celdas = within(f).getAllByRole("cell");
      expect(celdas[1]).toHaveTextContent(new RegExp(`^\\s*${PLAN[i]}\\b`));
      expect(celdas[2]).toHaveTextContent(new RegExp(`^\\s*${ACT[i]}\\b`));
      expect(celdas[3]).toHaveTextContent(new RegExp(`^\\s*${PAU[i]}\\b`));
    });
  });

  it("Estado: Hecha antes de la actual, Actual en la actual, Pendiente después", () => {
    render(<TablaTiempos fases={fases()} faseActual={3} />);
    const estados = filas().map((f) => within(f).getAllByRole("cell")[4].textContent?.trim());
    expect(estados).toEqual(["Hecha", "Hecha", "Actual", "Pendiente", "Pendiente", "Pendiente", "Pendiente"]);
  });

  it.each([
    [1, ["Actual", "Pendiente", "Pendiente", "Pendiente", "Pendiente", "Pendiente", "Pendiente"]],
    [7, ["Hecha", "Hecha", "Hecha", "Hecha", "Hecha", "Hecha", "Actual"]],
  ] as const)("Estado con fase actual %i", (actual, esperado) => {
    render(<TablaTiempos fases={fases()} faseActual={actual} />);
    const estados = filas().map((f) => within(f).getAllByRole("cell")[4].textContent?.trim());
    expect(estados).toEqual(esperado);
  });

  it("cada fila tiene una barra de progreso con valores 0..100, valor = porcentaje y nombre de la fase", () => {
    render(<TablaTiempos fases={fases()} faseActual={3} />);
    const barras = screen.getAllByRole("progressbar");
    expect(barras).toHaveLength(7);
    const pct = [150, 133, 80, 0, 0, 0, 0];
    barras.forEach((b, i) => {
      expect(b).toHaveAttribute("aria-valuemin", "0");
      expect(b).toHaveAttribute("aria-valuemax", "100");
      expect(b).toHaveAttribute("aria-valuenow", String(pct[i]));
      expect(b).toHaveAccessibleName(new RegExp(FASES[i + 1].nombre));
      expect(within(filas()[i]).getByRole("progressbar")).toBe(b);
    });
  });

  it("el porcentaje se muestra en texto junto a la barra", () => {
    render(<TablaTiempos fases={fases()} faseActual={3} />);
    expect(fila(1).textContent).toMatch(/150\s?%/);
    expect(fila(2).textContent).toMatch(/133\s?%/);
    expect(fila(3).textContent).toMatch(/80\s?%/);
    expect(fila(4).textContent).toMatch(/(^|\D)0\s?%/);
  });

  it("con más del 100 % la barra conserva el valor accesible real, pero ninguna medida visual pasa del 100 %", () => {
    render(<TablaTiempos fases={fases()} faseActual={3} />);
    const barra = within(fila(1)).getByRole("progressbar");
    expect(barra).toHaveAttribute("aria-valuenow", "150");
    // Ambigüedad del plan: no fija cómo se limita (style.width, transform, clase). Se comprueba
    // que ningún ancho en línea de la barra o sus hijos supere el 100 %.
    const anchos = [barra, ...Array.from(barra.querySelectorAll<HTMLElement>("*"))]
      .map((el) => el.style.width)
      .filter((w) => w.endsWith("%"))
      .map((w) => parseFloat(w));
    for (const w of anchos) expect(w).toBeLessThanOrEqual(100);
  });

  it("filas con activas > 0: la etiqueta del semáforo aparece como texto (rojo, rojo, ámbar)", () => {
    render(<TablaTiempos fases={fases()} faseActual={3} />);
    expect(within(fila(1)).getByText("Plan superado")).toBeInTheDocument();
    expect(within(fila(2)).getByText("Plan superado")).toBeInTheDocument();
    expect(within(fila(3)).getByText("Atención")).toBeInTheDocument();
    expect(within(fila(1)).queryByText("Atención")).not.toBeInTheDocument();
    expect(within(fila(3)).queryByText("Plan superado")).not.toBeInTheDocument();
  });

  it("una fila verde con activas > 0 muestra «En plazo»", () => {
    render(<TablaTiempos fases={fases([1, 1, 1, 0, 0, 0, 0])} faseActual={3} />);
    expect(within(fila(2)).getByText("En plazo")).toBeInTheDocument();
    expect(within(fila(3)).getByText("En plazo")).toBeInTheDocument();
  });

  it("en una fase en el límite exacto del plan (100 %) muestra «Atención», no «Plan superado»", () => {
    render(<TablaTiempos fases={fases([2, 3, 5, 0, 0, 0, 0])} faseActual={4} />);
    for (const n of [1, 2, 3]) {
      expect(within(fila(n)).getByText("Atención")).toBeInTheDocument();
      expect(within(fila(n)).queryByText("Plan superado")).not.toBeInTheDocument();
    }
  });

  it("no depende de cálculos propios del total: solo pinta lo que recibe (sin fila de totales inventada)", () => {
    render(<TablaTiempos fases={fases()} faseActual={3} />);
    expect(screen.getAllByRole("row")).toHaveLength(8);
  });

  it("sin violaciones de accesibilidad", async () => {
    const { container } = render(<TablaTiempos fases={fases()} faseActual={3} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
