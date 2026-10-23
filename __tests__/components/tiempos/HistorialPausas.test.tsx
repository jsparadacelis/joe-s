import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { HistorialPausas } from "@/components/tiempos/HistorialPausas";
import type { Pausa } from "@/lib/tiempos";

const PAUSAS: Pausa[] = [
  { desde: "2026-08-03", hasta: null, fase: 3, motivo: "espera-cliente", semanas: 1 },
  { desde: "2026-06-01", hasta: "2026-06-22", fase: 2, motivo: "decision-interna", semanas: 3 },
];

const filas = () => screen.getAllByRole("row").slice(1);

describe("HistorialPausas", () => {
  it("tiene las columnas Desde–Hasta, Fase, Motivo y Semanas", () => {
    render(<HistorialPausas pausas={PAUSAS} />);
    const h = screen.getAllByRole("columnheader").map((c) => c.textContent?.trim() ?? "");
    expect(h).toHaveLength(4);
    expect(h[0]).toMatch(/Desde/);
    expect(h[0]).toMatch(/Hasta/);
    expect(h.slice(1)).toEqual(["Fase", "Motivo", "Semanas"]);
  });

  it("una fila por pausa, en el orden recibido", () => {
    render(<HistorialPausas pausas={PAUSAS} />);
    expect(filas()).toHaveLength(2);
    expect(filas()[0]).toHaveTextContent("Espera del cliente");
    expect(filas()[1]).toHaveTextContent("Decisión interna");
  });

  it("pausa en curso: muestra «en curso» cuando hasta es null", () => {
    render(<HistorialPausas pausas={PAUSAS} />);
    expect(within(filas()[0]).getByText(/en curso/i)).toBeInTheDocument();
    expect(within(filas()[1]).queryByText(/en curso/i)).not.toBeInTheDocument();
  });

  it("pausa cerrada: muestra las fechas de inicio y de fin (formato libre: ISO o dd/mm/aaaa)", () => {
    render(<HistorialPausas pausas={PAUSAS} />);
    const t = filas()[1].textContent ?? "";
    expect(t).toMatch(/2026-06-01|01\/06\/2026|1 de junio/i);
    expect(t).toMatch(/2026-06-22|22\/06\/2026|22 de junio/i);
  });

  it("muestra la fase de cada pausa (nombre o número)", () => {
    render(<HistorialPausas pausas={PAUSAS} />);
    expect(filas()[0].textContent).toMatch(/Anteproyecto|Fase 3/);
    expect(filas()[1].textContent).toMatch(/Briefing y concepto|Fase 2/);
  });

  it("muestra las semanas de cada pausa", () => {
    render(<HistorialPausas pausas={PAUSAS} />);
    expect(within(filas()[0]).getAllByRole("cell").at(-1)).toHaveTextContent(/^\s*1\b/);
    expect(within(filas()[1]).getAllByRole("cell").at(-1)).toHaveTextContent(/^\s*3\b/);
  });

  it.each([
    ["espera-cliente", "Espera del cliente"],
    ["espera-organismo", "Espera de organismo"],
    ["decision-interna", "Decisión interna"],
    ["otra", "Otra"],
  ] as const)("el motivo %s se muestra como «%s», nunca el identificador", (motivo, etiqueta) => {
    render(<HistorialPausas pausas={[{ desde: "2026-01-05", hasta: "2026-01-12", fase: 1, motivo, semanas: 1 }]} />);
    expect(filas()[0]).toHaveTextContent(etiqueta);
    if (motivo.includes("-")) expect(filas()[0]).not.toHaveTextContent(motivo);
  });

  it("sin pausas muestra «Sin pausas registradas»", () => {
    render(<HistorialPausas pausas={[]} />);
    expect(screen.getByText("Sin pausas registradas")).toBeInTheDocument();
    expect(screen.queryByText(/en curso/i)).not.toBeInTheDocument();
  });

  it("con pausas no muestra el mensaje de vacío", () => {
    render(<HistorialPausas pausas={PAUSAS} />);
    expect(screen.queryByText("Sin pausas registradas")).not.toBeInTheDocument();
  });

  it.each([
    ["con pausas", PAUSAS],
    ["vacío", [] as Pausa[]],
  ])("sin violaciones de accesibilidad %s", async (_n, pausas) => {
    const { container } = render(<HistorialPausas pausas={pausas} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
