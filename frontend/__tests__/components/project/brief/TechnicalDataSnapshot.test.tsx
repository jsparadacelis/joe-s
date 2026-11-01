/**
 * RGB-32b contract of `@/components/project/brief/TechnicalDataSnapshot` (to be created by the front developer):
 *   <TechnicalDataSnapshot technicalData />     technicalData: BriefTechnicalData (`brief.technical_data`)
 *   Read-only list of the technical data frozen with the brief. Renders <section aria-label="Datos técnicos congelados">
 *   with:
 *     - the cadastral reference («Referencia catastral: 0000000AA0000A0000AA») and the query date
 *       («Consultado el 01/11/2026», es-ES, UTC), each only when present;
 *     - a <table> (accessible name «Datos técnicos congelados») with columns «Dato», «Valor», «Origen», «Original»,
 *       «Editado», «Verificado» and one row per datum, in the order received. «Dato» is the label from DEFINITIONS
 *       (`@/lib/technical-data`; an unknown id shows the id). «Origen» is sourceLabel(source). «Original» is the original
 *       value or «—» when null. «Editado» reads «Sí» / «No». «Verificado» reads «Sí» for verified; a datum with a value that
 *       is not verified reads «Sin verificar»; a datum with no value reads «—» in Verificado. An empty value reads «Sin valor».
 *     - above the table, when technicalData.unverified is not empty, a role="status"-free note
 *       «1 dato técnico sin verificar» / «N datos técnicos sin verificar» listing their labels; absent when none.
 *     - when data is empty: the text «No se obtuvo ningún dato técnico.» and no table.
 *   Nothing is editable: no buttons, inputs, selects or links.
 */
import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { TechnicalDataSnapshot } from "@/components/project/brief/TechnicalDataSnapshot";
import type { BriefTechnicalData } from "@/lib/brief";
import { TECHNICAL_DATA } from "../../../helpers/brief-fixtures";

const data = (overrides: Partial<BriefTechnicalData> = {}) => ({ ...TECHNICAL_DATA, ...overrides }) as unknown as BriefTechnicalData;
const row = (label: string) => within(screen.getByRole("table", { name: "Datos técnicos congelados" })).getByText(label).closest("tr") as HTMLElement;

describe("<TechnicalDataSnapshot>", () => {
  it("shows the cadastral reference and the query date", () => {
    render(<TechnicalDataSnapshot technicalData={data()} />);
    const section = screen.getByRole("region", { name: "Datos técnicos congelados" });
    expect(section).toHaveTextContent("Referencia catastral: 0000000AA0000A0000AA");
    expect(section).toHaveTextContent("Consultado el 01/11/2026");
  });

  it("omits the reference and the date when there was no query", () => {
    render(<TechnicalDataSnapshot technicalData={data({ cadastral_reference: null, queried_at: null })} />);
    const section = screen.getByRole("region", { name: "Datos técnicos congelados" });
    expect(section).not.toHaveTextContent("Referencia catastral");
    expect(section).not.toHaveTextContent("Consultado");
  });

  it("has the six column headers", () => {
    render(<TechnicalDataSnapshot technicalData={data()} />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Dato", "Valor", "Origen", "Original", "Editado", "Verificado"]);
  });

  it("one row per datum in the received order, with the catalog label", () => {
    render(<TechnicalDataSnapshot technicalData={data()} />);
    const rows = within(screen.getByRole("table", { name: "Datos técnicos congelados" })).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual(["Dirección", "Uso catastral", "Año de construcción", "Altitud"]);
  });

  it("a verified datum shows value, origin, original and the checks", () => {
    render(<TechnicalDataSnapshot technicalData={data()} />);
    const cells = within(row("Dirección")).getAllByRole("cell").map((c) => c.textContent);
    expect(cells).toEqual(["Dirección", "Calle Ejemplo 1", "Catastro", "Calle Ejemplo 1", "No", "Sí"]);
  });

  it("an edited datum shows the original next to the edited value", () => {
    render(<TechnicalDataSnapshot technicalData={data()} />);
    const cells = within(row("Uso catastral")).getAllByRole("cell").map((c) => c.textContent);
    expect(cells).toEqual(["Uso catastral", "Comercial", "Catastro", "Residencial", "Sí", "Sí"]);
  });

  it("a manual datum has no original and, when not verified, is flagged «Sin verificar»", () => {
    render(<TechnicalDataSnapshot technicalData={data()} />);
    const cells = within(row("Año de construcción")).getAllByRole("cell").map((c) => c.textContent);
    expect(cells).toEqual(["Año de construcción", "1990", "Manual", "—", "No", "Sin verificar"]);
  });

  it("a datum without value reads «Sin valor» and is not flagged", () => {
    render(<TechnicalDataSnapshot technicalData={data()} />);
    const cells = within(row("Altitud")).getAllByRole("cell").map((c) => c.textContent);
    expect(cells[1]).toBe("Sin valor");
    expect(cells[5]).toBe("—");
  });

  it("notes the unverified data above the table, naming them", () => {
    render(<TechnicalDataSnapshot technicalData={data()} />);
    const note = screen.getByText(/1 dato técnico sin verificar/);
    expect(note).toHaveTextContent("Año de construcción");
    expect(note.compareDocumentPosition(screen.getByRole("table")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("pluralizes the note", () => {
    render(<TechnicalDataSnapshot technicalData={data({ unverified: ["year", "address"] })} />);
    expect(screen.getByText(/2 datos técnicos sin verificar/)).toHaveTextContent(/Año de construcción.*Dirección|Dirección.*Año de construcción/);
  });

  it("no note when everything is verified", () => {
    render(<TechnicalDataSnapshot technicalData={data({ unverified: [] })} />);
    expect(screen.queryByText(/sin verificar/i, { selector: "p, div, li, section > span" })).not.toBeInTheDocument();
  });

  it("an unknown id falls back to the id and an unknown source to the raw source", () => {
    const custom = data({ data: [{ id: "mystery", value: "7", source: "future_source", original: "7", edited: false, verified: true }], unverified: [] });
    render(<TechnicalDataSnapshot technicalData={custom} />);
    const cells = within(row("mystery")).getAllByRole("cell").map((c) => c.textContent);
    expect(cells[2]).toBe("future_source");
  });

  it("without data: a message and no table", () => {
    render(<TechnicalDataSnapshot technicalData={data({ data: [], unverified: [], cadastral_reference: null, queried_at: null })} />);
    expect(screen.getByText("No se obtuvo ningún dato técnico.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("is read-only: no controls at all", () => {
    render(<TechnicalDataSnapshot technicalData={data()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("no accessibility violations, with data and empty", async () => {
    const view = render(<TechnicalDataSnapshot technicalData={data()} />);
    expect(await axe(view.container)).toHaveNoViolations();
    view.unmount();
    const empty = render(<TechnicalDataSnapshot technicalData={data({ data: [], unverified: [] })} />);
    expect(await axe(empty.container)).toHaveNoViolations();
  });
});
