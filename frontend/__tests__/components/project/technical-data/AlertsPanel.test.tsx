/**
 * RGB-51b · contract for `<AlertsPanel alerts={Alert[]} />` (new component, `AlertsPanel.tsx`):
 * a list of cross-data alerts. Severity is shown as text (`warning` -> «Aviso», `info` -> «Información»)
 * besides colour, with the message, the suggestion and the affected data by label. No alerts: renders nothing.
 */
import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { AlertsPanel } from "@/components/project/technical-data/AlertsPanel";
import type { Alert } from "@/lib/alerts-api";

const WARNING: Alert = {
  code: "area_mismatch",
  severity: "warning",
  message: "La superficie del Catastro (96 m²) y la del polígono (99,4 m²) difieren un 3,5 %.",
  suggestion: "Revisa cuál usar como superficie de cálculo.",
  fields: ["cadastralPlotArea", "polygonPlotArea"],
};
const INFO: Alert = {
  code: "old_building",
  severity: "info",
  message: "La construcción es anterior a 1980 (año 1958).",
  suggestion: "Revisa la estructura y la normativa aplicable al edificio existente.",
  fields: ["year"],
};

describe("AlertsPanel", () => {
  it("without alerts it renders nothing", () => {
    const { container } = render(<AlertsPanel alerts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows one list item per alert with message and suggestion", () => {
    render(<AlertsPanel alerts={[WARNING, INFO]} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText(WARNING.message)).toBeInTheDocument();
    expect(within(items[0]).getByText(WARNING.suggestion)).toBeInTheDocument();
    expect(within(items[1]).getByText(INFO.message)).toBeInTheDocument();
    expect(within(items[1]).getByText(INFO.suggestion)).toBeInTheDocument();
  });

  it("severity is text, not only colour", () => {
    render(<AlertsPanel alerts={[WARNING, INFO]} />);
    const [first, second] = screen.getAllByRole("listitem");
    expect(within(first).getByText("Aviso")).toBeInTheDocument();
    expect(within(first).queryByText("Información")).not.toBeInTheDocument();
    expect(within(second).getByText("Información")).toBeInTheDocument();
    expect(within(second).queryByText("Aviso")).not.toBeInTheDocument();
  });

  it("names the affected data by their label, never by id", () => {
    render(<AlertsPanel alerts={[WARNING]} />);
    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent("Sup. de parcela (Catastro)");
    expect(item).toHaveTextContent("Sup. de parcela (polígono)");
    expect(item).not.toHaveTextContent("cadastralPlotArea");
  });

  it("an alert without fields shows no list of data", () => {
    render(<AlertsPanel alerts={[{ ...INFO, fields: [] }]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("an unknown field id does not break the panel", () => {
    render(<AlertsPanel alerts={[{ ...INFO, fields: ["unknownField"] }]} />);
    expect(screen.getByText(INFO.message)).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<AlertsPanel alerts={[WARNING, INFO]} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
