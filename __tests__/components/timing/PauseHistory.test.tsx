import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { PauseHistory } from "@/components/timing/PauseHistory";
import type { Pause } from "@/lib/timing";

const PAUSES: Pause[] = [
  { from: "2026-08-03", to: null, phase: 3, reason: "client-wait", weeks: 1 },
  { from: "2026-06-01", to: "2026-06-22", phase: 2, reason: "internal-decision", weeks: 3 },
];

const rows = () => screen.getAllByRole("row").slice(1);

describe("HistorialPausas", () => {
  it("tiene las columnas Desde–Hasta, Fase, Motivo y Semanas", () => {
    render(<PauseHistory pauses={PAUSES} />);
    const h = screen.getAllByRole("columnheader").map((c) => c.textContent?.trim() ?? "");
    expect(h).toHaveLength(4);
    expect(h[0]).toMatch(/Desde/);
    expect(h[0]).toMatch(/Hasta/);
    expect(h.slice(1)).toEqual(["Fase", "Motivo", "Semanas"]);
  });

  it("una fila por pausa, en el orden recibido", () => {
    render(<PauseHistory pauses={PAUSES} />);
    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toHaveTextContent("Espera del cliente");
    expect(rows()[1]).toHaveTextContent("Decisión interna");
  });

  it("pausa en curso: muestra «en curso» cuando hasta es null", () => {
    render(<PauseHistory pauses={PAUSES} />);
    expect(within(rows()[0]).getByText(/en curso/i)).toBeInTheDocument();
    expect(within(rows()[1]).queryByText(/en curso/i)).not.toBeInTheDocument();
  });

  it("pausa cerrada: muestra las fechas de inicio y de fin (formato libre: ISO o dd/mm/aaaa)", () => {
    render(<PauseHistory pauses={PAUSES} />);
    const t = rows()[1].textContent ?? "";
    expect(t).toMatch(/2026-06-01|01\/06\/2026|1 de junio/i);
    expect(t).toMatch(/2026-06-22|22\/06\/2026|22 de junio/i);
  });

  it("muestra la fase de cada pausa (nombre o número)", () => {
    render(<PauseHistory pauses={PAUSES} />);
    expect(rows()[0].textContent).toMatch(/Anteproyecto|Fase 3/);
    expect(rows()[1].textContent).toMatch(/Briefing y concepto|Fase 2/);
  });

  it("muestra las semanas de cada pausa", () => {
    render(<PauseHistory pauses={PAUSES} />);
    expect(within(rows()[0]).getAllByRole("cell").at(-1)).toHaveTextContent(/^\s*1\b/);
    expect(within(rows()[1]).getAllByRole("cell").at(-1)).toHaveTextContent(/^\s*3\b/);
  });

  it.each([
    ["client-wait", "Espera del cliente"],
    ["authority-wait", "Espera de organismo"],
    ["internal-decision", "Decisión interna"],
    ["other", "Otra"],
  ] as const)("el motivo %s se muestra como «%s», nunca el identificador", (reason, label) => {
    render(<PauseHistory pauses={[{ from: "2026-01-05", to: "2026-01-12", phase: 1, reason, weeks: 1 }]} />);
    expect(rows()[0]).toHaveTextContent(label);
    if (reason.includes("-")) expect(rows()[0]).not.toHaveTextContent(reason);
  });

  it("sin pausas muestra «Sin pausas registradas»", () => {
    render(<PauseHistory pauses={[]} />);
    expect(screen.getByText("Sin pausas registradas")).toBeInTheDocument();
    expect(screen.queryByText(/en curso/i)).not.toBeInTheDocument();
  });

  it("con pausas no muestra el mensaje de vacío", () => {
    render(<PauseHistory pauses={PAUSES} />);
    expect(screen.queryByText("Sin pausas registradas")).not.toBeInTheDocument();
  });

  it.each([
    ["con pausas", PAUSES],
    ["vacío", [] as Pause[]],
  ])("sin violaciones de accesibilidad %s", async (_n, pauses) => {
    const { container } = render(<PauseHistory pauses={pauses} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
