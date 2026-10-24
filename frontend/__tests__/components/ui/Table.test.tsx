import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { Table, type TableColumn } from "@/components/ui/Table";

type Row = { id: string; name: string };
const columns: TableColumn<Row>[] = [
  { key: "id", header: "Code", render: (r) => r.id },
  { key: "nombre", header: "Nombre", render: (r) => r.name },
];
const rows: Row[] = [{ id: "A-1", name: "Sample one" }, { id: "A-2", name: "Sample two" }];

describe("Table", () => {
  it("renders headers with scope=col and rows", () => {
    render(<Table caption="Samples" columns={columns} rows={rows} getRowKey={(r) => r.id} />);
    expect(screen.getByRole("table", { name: "Samples" })).toBeInTheDocument();
    screen.getAllByRole("columnheader").forEach((th) => expect(th).toHaveAttribute("scope", "col"));
    expect(screen.getByText("Sample two")).toBeInTheDocument();
  });

  it("shows the empty message", () => {
    render(<Table caption="Empty" columns={columns} rows={[]} getRowKey={(r) => r.id} emptyMessage="Sin datos" />);
    expect(screen.getByText("Sin datos")).toHaveAttribute("colspan", "2");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<Table caption="Samples" columns={columns} rows={rows} getRowKey={(r) => r.id} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
