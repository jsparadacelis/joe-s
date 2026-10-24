import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { Table, type TableColumn } from "@/components/ui/Table";

type Row = { id: string; name: string };
const columns: TableColumn<Row>[] = [
  { key: "id", header: "Código", render: (r) => r.id },
  { key: "nombre", header: "Nombre", render: (r) => r.name },
];
const rows: Row[] = [{ id: "A-1", name: "Ejemplo uno" }, { id: "A-2", name: "Ejemplo dos" }];

describe("Table", () => {
  it("renderiza cabeceras con scope=col y filas", () => {
    render(<Table caption="Ejemplos" columns={columns} rows={rows} getRowKey={(r) => r.id} />);
    expect(screen.getByRole("table", { name: "Ejemplos" })).toBeInTheDocument();
    screen.getAllByRole("columnheader").forEach((th) => expect(th).toHaveAttribute("scope", "col"));
    expect(screen.getByText("Ejemplo dos")).toBeInTheDocument();
  });

  it("muestra el mensaje de vacío", () => {
    render(<Table caption="Vacía" columns={columns} rows={[]} getRowKey={(r) => r.id} emptyMessage="Sin datos" />);
    expect(screen.getByText("Sin datos")).toHaveAttribute("colspan", "2");
  });

  it("no tiene violaciones de accesibilidad", async () => {
    const { container } = render(<Table caption="Ejemplos" columns={columns} rows={rows} getRowKey={(r) => r.id} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
