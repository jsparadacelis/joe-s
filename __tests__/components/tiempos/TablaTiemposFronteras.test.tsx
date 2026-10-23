import { render, screen } from "@testing-library/react";
import { TablaTiempos } from "@/components/tiempos/TablaTiempos";
import type { TiempoFase } from "@/lib/tiempos";

// Regresión del Tester: fronteras del semáforo en la UI con plan 100 (79/80/100/101 %).
const CASOS: [number, string, string][] = [
  [79, "79 %", "En plazo"],
  [80, "80 %", "Atención"],
  [100, "100 %", "Atención"],
  [101, "101 %", "Plan superado"],
];

describe("TablaTiempos · fronteras del semáforo en pantalla", () => {
  it.each(CASOS)("%i activas de 100: %s y %s", (activas, pct, etiqueta) => {
    const fases: TiempoFase[] = [{ fase: 1, planSemanas: 100, activasSemanas: activas, pausaSemanas: 0 }];
    render(<TablaTiempos fases={fases} faseActual={1} />);
    expect(screen.getByText(pct)).toBeInTheDocument();
    expect(screen.getByText(etiqueta)).toBeInTheDocument();
    const barra = screen.getByRole("progressbar");
    expect(barra).toHaveAttribute("aria-valuenow", String(activas));
  });

  it("el redondeo no cambia el semáforo: 79,6 % se muestra 80 % pero sigue en plazo", () => {
    const fases: TiempoFase[] = [{ fase: 1, planSemanas: 500, activasSemanas: 398, pausaSemanas: 0 }];
    render(<TablaTiempos fases={fases} faseActual={1} />);
    expect(screen.getByText("80 %")).toBeInTheDocument();
    expect(screen.getByText("En plazo")).toBeInTheDocument();
  });
});
