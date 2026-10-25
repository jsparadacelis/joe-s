/**
 * RGB-17a contract of `@/components/project/sheet/ProjectSheet` (to be created by the front developer):
 *   <ProjectSheet sheet={ProjectSheet} />   (type from `@/lib/sheet`)
 * An <h2> «Ficha del proyecto»; a summary with role="status" (aria-live="polite") that says the percentage
 * («35 %»), «7 de 20 campos obligatorios» and the missing required fields by label; then one <SheetBlock>
 * per block, in the order received.
 */
import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { ProjectSheet } from "@/components/project/sheet/ProjectSheet";
import type { ProjectSheet as ProjectSheetModel } from "@/lib/sheet";
import { API_SHEET } from "../../../helpers/sheet-fixtures";

const SHEET = API_SHEET as unknown as ProjectSheetModel;
const COMPLETE = {
  ...API_SHEET,
  completion: { filled: 20, required: 20, percent: 100 },
  blocks: API_SHEET.blocks.map((b) => ({
    ...b,
    filled: b.required,
    complete: true,
    fields: b.fields.map((f) => (f.required && f.value === null ? { ...f, value: "Dato de prueba" } : f)),
  })),
} as unknown as ProjectSheetModel;

describe("<ProjectSheet>", () => {
  it("has an h2 «Ficha del proyecto» and the eight blocks as h3 in order", () => {
    render(<ProjectSheet sheet={SHEET} />);
    expect(screen.getByRole("heading", { level: 2, name: "Ficha del proyecto" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Identificación", "Encargo", "Gobierno", "Cliente", "Tiempo", "Riesgo", "Información", "Estado",
    ]);
  });

  it("summary is a polite live region with percentage and counts", () => {
    render(<ProjectSheet sheet={SHEET} />);
    const summary = screen.getByRole("status");
    expect(summary).toHaveAttribute("aria-live", "polite");
    expect(summary).toHaveTextContent("35 %");
    expect(summary).toHaveTextContent("7 de 20 campos obligatorios");
  });

  it("the summary lists the missing required fields by label (and not the filled or optional ones)", () => {
    render(<ProjectSheet sheet={SHEET} />);
    const summary = within(screen.getByRole("status"));
    for (const label of ["Referencia catastral", "Alcance incluido", "Contacto del cliente", "Próximo hito", "Riesgo principal", "Ruta del repositorio"]) {
      expect(summary.getByText(label)).toBeInTheDocument();
    }
    expect(summary.queryByText("Nombre")).not.toBeInTheDocument();
    expect(summary.queryByText("Equipo")).not.toBeInTheDocument();
    expect(summary.queryByText("Plan confirmado")).not.toBeInTheDocument();
    expect(summary.queryByText("Semáforo")).not.toBeInTheDocument();
  });

  it("each block says «Completo» or «Faltan N»", () => {
    render(<ProjectSheet sheet={SHEET} />);
    expect(within(screen.getByRole("region", { name: "Estado" })).getByText("Completo")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Gobierno" })).getByText("Faltan 3")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Encargo" })).getByText("Faltan 3")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Tiempo" })).getByText("Faltan 2")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Identificación" })).getByText("Falta 1")).toBeInTheDocument();
  });

  it("marks the required empty fields with text: one mark per missing field of the whole sheet", () => {
    render(<ProjectSheet sheet={SHEET} />);
    expect(screen.getAllByText("Obligatorio · falta")).toHaveLength(20 - 7);
  });

  it("labels the preloaded fields «del scoring» (the confirmed plan included)", () => {
    render(<ProjectSheet sheet={SHEET} />);
    expect(screen.getAllByText(/del scoring/i)).toHaveLength(5);
  });

  it("shows the enumerated values in Spanish and the confirmed plan total", () => {
    render(<ProjectSheet sheet={SHEET} />);
    expect(screen.getByText("Vivienda unifamiliar")).toBeInTheDocument();
    expect(screen.getByText("Media")).toBeInTheDocument();
    expect(screen.getByText("En plazo")).toBeInTheDocument();
    expect(screen.getByText(/65 semanas/)).toBeInTheDocument();
    for (const raw of ["single_family_house", "medium", "green"]) expect(screen.queryByText(raw)).not.toBeInTheDocument();
  });

  it("a complete sheet says 100 %, has no missing marks and no list of missing fields", () => {
    render(<ProjectSheet sheet={COMPLETE} />);
    expect(screen.getByRole("status")).toHaveTextContent("100 %");
    expect(screen.getByRole("status")).toHaveTextContent("20 de 20 campos obligatorios");
    expect(screen.queryByText("Obligatorio · falta")).not.toBeInTheDocument();
    expect(screen.getAllByText("Completo")).toHaveLength(8);
    expect(screen.queryByText(/Faltan?\s\d/)).not.toBeInTheDocument();
  });

  it("an empty sheet says 0 %", () => {
    const empty = { ...SHEET, completion: { filled: 0, required: 20, percent: 0 } };
    render(<ProjectSheet sheet={empty} />);
    expect(screen.getByRole("status")).toHaveTextContent("0 %");
  });

  it("no accessibility violations (incomplete and complete)", async () => {
    const first = render(<ProjectSheet sheet={SHEET} />);
    expect(await axe(first.container)).toHaveNoViolations();
    first.unmount();
    const second = render(<ProjectSheet sheet={COMPLETE} />);
    expect(await axe(second.container)).toHaveNoViolations();
  });
});
