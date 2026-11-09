/**
 * RGB-51b · `<CapacityPanel>` paints what the server returns. Props:
 *   capacity: Capacity | null; missing?: string[] (datum ids); loading?: boolean; failed?: boolean
 *  - loading -> «Calculando…» (role="status"), no figures
 *  - failed  -> a notice «No se pudo calcular la capacidad…», no figures
 *  - capacity null with `missing` -> «Rellena: <labels>» (labels of the data, in Spanish)
 *  - capacity null, nothing missing -> the previous generic notice
 */
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { CapacityPanel } from "@/components/project/technical-data/CapacityPanel";
import type { Capacity } from "@/lib/capacity";

// PRD case: 96 m², 1,5, 70 %, PB+2.
const PRD: Capacity = {
  surface: 96,
  buildableArea: 144,
  footprint: 67.2,
  byFloors: 201.6,
  maximum: 144,
  limitedBy: "buildability",
  existing: 142,
  minPlot: 90,
  meetsMinPlot: true,
};

describe("CapacityPanel · server data", () => {
  it("PRD case: 144 m²t limited by buildability", () => {
    render(<CapacityPanel capacity={PRD} />);
    expect(screen.getAllByText("144 m²t").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("67,2 m²")).toBeInTheDocument();
    expect(screen.getByText("201,6 m²t")).toBeInTheDocument();
    expect(screen.getByText(/limita: Edificabilidad/)).toBeInTheDocument();
    expect(screen.getAllByText("Limita")).toHaveLength(1);
  });

  it("loading: «Calculando…» as a status and no figures", () => {
    render(<CapacityPanel capacity={null} loading />);
    expect(screen.getByRole("status")).toHaveTextContent("Calculando…");
    expect(screen.queryByText(/techo por edificabilidad/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rellena/)).not.toBeInTheDocument();
  });

  it("failed: a notice and no figures, not even the stale ones", () => {
    render(<CapacityPanel capacity={PRD} failed />);
    expect(screen.getByText(/No se pudo calcular la capacidad/)).toBeInTheDocument();
    expect(screen.queryByText(/techo por edificabilidad/)).not.toBeInTheDocument();
  });

  it("missing ids become «Rellena: …» with the labels of the data", () => {
    render(<CapacityPanel capacity={null} missing={["buildability", "maxOccupancy", "floors"]} />);
    expect(screen.getByText(/Rellena: Edificabilidad, Ocupación máxima, Número de plantas/)).toBeInTheDocument();
    expect(screen.queryByText(/buildability|maxOccupancy/)).not.toBeInTheDocument();
  });

  it("the calculation surface missing is named too", () => {
    render(<CapacityPanel capacity={null} missing={["polygonPlotArea"]} />);
    expect(screen.getByText(/Rellena: Sup\. de parcela \(polígono\)/)).toBeInTheDocument();
  });

  it("without capacity and nothing missing it keeps the generic notice", () => {
    render(<CapacityPanel capacity={null} />);
    expect(screen.getByText("Rellena edificabilidad, ocupación y número de plantas para calcular la capacidad.")).toBeInTheDocument();
  });

  it.each([
    ["figures", <CapacityPanel key="a" capacity={PRD} />],
    ["missing", <CapacityPanel key="b" capacity={null} missing={["floors"]} />],
    ["loading", <CapacityPanel key="c" capacity={null} loading />],
    ["failed", <CapacityPanel key="d" capacity={null} failed />],
  ])("has no axe violations (%s)", async (_name, ui) => {
    const { container } = render(ui);
    expect(await axe(container)).toHaveNoViolations();
  });
});
