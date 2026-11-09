import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { ToPromoteTable } from "@/components/to-promote/ToPromoteTable";
import { makeProject, TO_PROMOTE } from "../../helpers/to-promote-fixtures";

// next/link schedules an async router update that triggers `act(...)` warnings in jsdom; a plain anchor is enough here.
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const TABLE_NAME = "Proyectos por promover";
const bodyRows = () => screen.getAllByRole("row").slice(1);
const rowOf = (code: string) => {
  const row = bodyRows().find((r) => within(r).queryByRole("link", { name: new RegExp(code) }));
  if (!row) throw new Error(`no row for ${code}`);
  return row;
};

describe("ToPromoteTable", () => {
  it("is an accessible table with a name and column headers", () => {
    render(<ToPromoteTable projects={TO_PROMOTE.projects} />);
    expect(screen.getByRole("table", { name: TABLE_NAME })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Proyecto",
      "Fase",
      "Entregable de salida",
      "Estado",
      "Quién promueve",
    ]);
  });

  it("keeps the order given by the server (no re-sorting)", () => {
    const reversed = [...TO_PROMOTE.projects].reverse();
    render(<ToPromoteTable projects={reversed} />);
    const codes = bodyRows().map((r) => within(r).getAllByRole("link")[0].textContent);
    expect(codes.map((c) => c?.match(/PRY-\d{4}-\d{3}/)?.[0])).toEqual([
      "PRY-2026-004", "PRY-2026-003", "PRY-2026-002", "PRY-2026-001",
    ]);
  });

  it("links the project to its page /projects/{code} and shows code and name", () => {
    render(<ToPromoteTable projects={TO_PROMOTE.projects} />);
    const row = rowOf("PRY-2026-003");
    const link = within(row).getByRole("link", { name: /PRY-2026-003/ });
    expect(link).toHaveAttribute("href", "/projects/PRY-2026-003");
    expect(link).toHaveTextContent("Rehabilitación Casa del Molino (demo)");
  });

  it("shows the phase with its name, and the exit deliverable", () => {
    render(<ToPromoteTable projects={TO_PROMOTE.projects} />);
    const row = rowOf("PRY-2026-004");
    expect(within(row).getByText("2. Briefing y concepto")).toBeInTheDocument();
    expect(within(row).getByText("Brief aprobado")).toBeInTheDocument();
    expect(within(rowOf("PRY-2026-001")).getByText("0. Oportunidad")).toBeInTheDocument();
  });

  it.each([
    ["PRY-2026-001", "Listo para promover"],
    ["PRY-2026-003", "En curso"],
    ["PRY-2026-004", "Bloqueado"],
  ])("%s shows its state as text (never only colour): «%s»", (code, label) => {
    render(<ToPromoteTable projects={TO_PROMOTE.projects} />);
    expect(within(rowOf(code)).getByText(label)).toBeInTheDocument();
  });

  it("shows the reason when it exists and nothing when it is null", () => {
    render(<ToPromoteTable projects={TO_PROMOTE.projects} />);
    expect(within(rowOf("PRY-2026-003")).getByText("Falta: Referencia catastral y 2 más.")).toBeInTheDocument();
    expect(within(rowOf("PRY-2026-004")).getByText("En pausa; reanudación prevista el 21/11/2026.")).toBeInTheDocument();
    expect(rowOf("PRY-2026-001")).not.toHaveTextContent("null");
    expect(rowOf("PRY-2026-001")).not.toHaveTextContent("Falta");
  });

  it("shows who promotes, and «Puedes promover» only when can_promote is true", () => {
    render(<ToPromoteTable projects={TO_PROMOTE.projects} />);
    const yes = rowOf("PRY-2026-001");
    expect(within(yes).getByText("Socio o director")).toBeInTheDocument();
    expect(within(yes).getByText("Puedes promover")).toBeInTheDocument();
    // can_promote does not depend on the state: an in-progress project can still be promotable by this person.
    expect(within(rowOf("PRY-2026-003")).getByText("Puedes promover")).toBeInTheDocument();
    const no = rowOf("PRY-2026-002");
    expect(within(no).getByText("Socio o director")).toBeInTheDocument();
    expect(within(no).queryByText("Puedes promover")).not.toBeInTheDocument();
    expect(within(rowOf("PRY-2026-004")).getByText("Director de proyecto")).toBeInTheDocument();
    expect(screen.getAllByText("Puedes promover")).toHaveLength(2);
  });

  it("has no buttons: promoting is done on the project page", () => {
    render(<ToPromoteTable projects={TO_PROMOTE.projects} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("does not break on a state this client does not know", () => {
    render(<ToPromoteTable projects={[makeProject({ state: "archived", reason: null })]} />);
    expect(screen.getByText("Estado desconocido")).toBeInTheDocument();
  });

  it("lets long names, deliverables and reasons wrap (break-words)", () => {
    const long = "Palabra".repeat(40);
    render(
      <ToPromoteTable
        projects={[makeProject({ name: `Nombre${long}`, deliverable: `Entregable${long}`, reason: `Falta: ${long}` })]}
      />,
    );
    for (const text of [`Nombre${long}`, `Entregable${long}`, `Falta: ${long}`]) {
      expect(screen.getByText(text).closest(".break-words")).not.toBeNull();
    }
  });

  it("empty list: shows «No hay proyectos por promover» and no table", () => {
    render(<ToPromoteTable projects={[]} />);
    expect(screen.getByText("No hay proyectos por promover")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("has no accessibility violations (full list)", async () => {
    const { container } = render(<ToPromoteTable projects={TO_PROMOTE.projects} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no accessibility violations (empty list)", async () => {
    const { container } = render(<ToPromoteTable projects={[]} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
