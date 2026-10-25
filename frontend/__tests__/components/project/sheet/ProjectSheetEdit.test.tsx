/**
 * RGB-17b contract of `@/components/project/sheet/ProjectSheet` (extended):
 *   <ProjectSheet sheet editable? save? loadPlan? />
 *     editable?: boolean (default false) -> passed to every <SheetBlock> with code={sheet.code}
 *     save?, loadPlan?: as in SheetBlock (default saveProjectSheet / fetchProposedPlan)
 *   Holds the sheet in state: after a successful save it shows the sheet returned by the API (summary percentage,
 *   missing list and block status «Completo» / «Faltan N» updated). The description no longer says «Solo lectura»
 *   when editable.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { ProjectSheet } from "@/components/project/sheet/ProjectSheet";
import type { ProjectSheet as ProjectSheetModel } from "@/lib/sheet";
import { API_SHEET } from "../../../helpers/sheet-fixtures";

const SHEET = API_SHEET as unknown as ProjectSheetModel;
const AFTER_GOVERNANCE = {
  ...API_SHEET,
  completion: { filled: 9, required: 20, percent: 45 },
  blocks: API_SHEET.blocks.map((b) =>
    b.block === "governance"
      ? {
          ...b,
          filled: 2,
          fields: b.fields.map((f) => (f.field === "sponsor" ? { ...f, value: "Promotora de prueba" } : f.field === "technical_lead" ? { ...f, value: "Persona técnica" } : f)),
        }
      : b,
  ),
} as unknown as ProjectSheetModel;
const AFTER_ALL = {
  ...AFTER_GOVERNANCE,
  completion: { filled: 10, required: 20, percent: 50 },
  blocks: AFTER_GOVERNANCE.blocks.map((b) =>
    b.block === "governance"
      ? { ...b, filled: 3, complete: true, fields: b.fields.map((f) => (f.field === "project_director" ? { ...f, value: "Dirección de prueba" } : f)) }
      : b,
  ),
} as unknown as ProjectSheetModel;

const region = (name: string) => screen.getByRole("region", { name });

describe("<ProjectSheet> editing (RGB-17b)", () => {
  it("is read-only by default: no «Editar» buttons and the read-only description", () => {
    render(<ProjectSheet sheet={SHEET} />);
    expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Solo lectura/)).toBeInTheDocument();
  });

  it("editable: seven blocks have «Editar» (all but «Estado») and the description is not «Solo lectura»", () => {
    render(<ProjectSheet sheet={SHEET} editable />);
    expect(screen.getAllByRole("button", { name: /^Editar/ })).toHaveLength(7);
    expect(within(region("Estado")).queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Solo lectura/)).not.toBeInTheDocument();
  });

  it("saving a block refreshes the summary, the missing list and the block status from the returned sheet", async () => {
    const save = jest.fn().mockResolvedValue(AFTER_GOVERNANCE);
    const user = userEvent.setup();
    render(<ProjectSheet sheet={SHEET} editable save={save} />);
    expect(within(region("Gobierno")).getByText("Faltan 3")).toBeInTheDocument();
    await user.click(within(region("Gobierno")).getByRole("button", { name: /^Editar/ }));
    await user.type(screen.getByLabelText("Promotor"), "Promotora de prueba");
    await user.type(screen.getByLabelText("Responsable técnico"), "Persona técnica");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(within(region("Gobierno")).getByText("Falta 1")).toBeInTheDocument());
    expect(save).toHaveBeenCalledWith({ fields: { sponsor: "Promotora de prueba", technical_lead: "Persona técnica" } });
    const summary = screen.getAllByRole("status")[0];
    expect(summary).toHaveTextContent("45 %");
    expect(summary).toHaveTextContent("9 de 20 campos obligatorios");
    expect(within(summary).queryByText("Promotor")).not.toBeInTheDocument();
    expect(within(summary).getByText("Dirección del proyecto")).toBeInTheDocument();
    expect(within(region("Gobierno")).getByText("Promotora de prueba")).toBeInTheDocument();
    expect(screen.queryByLabelText("Promotor")).not.toBeInTheDocument();
  });

  it("when the last missing field is filled the block says «Completo»", async () => {
    const save = jest.fn().mockResolvedValue(AFTER_ALL);
    const user = userEvent.setup();
    render(<ProjectSheet sheet={AFTER_GOVERNANCE} editable save={save} />);
    await user.click(within(region("Gobierno")).getByRole("button", { name: /^Editar/ }));
    await user.type(screen.getByLabelText("Dirección del proyecto"), "Dirección de prueba");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(within(region("Gobierno")).getByText("Completo")).toBeInTheDocument());
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("50 %");
  });

  it("a recalculated plan returned by the API is shown in the timing block", async () => {
    const recalculated = {
      ...API_SHEET,
      blocks: API_SHEET.blocks.map((b) =>
        b.block === "timing"
          ? { ...b, fields: b.fields.map((f) => (f.field === "confirmed_plan" ? { ...f, value: { weeks_by_phase: { "1": 3, "2": 4, "3": 6, "4": 8, "5": 9, "6": 40, "7": 5 }, total: 75 } } : f)) }
          : b,
      ),
    } as unknown as ProjectSheetModel;
    const user = userEvent.setup();
    render(<ProjectSheet sheet={SHEET} editable save={jest.fn().mockResolvedValue(recalculated)} loadPlan={jest.fn().mockResolvedValue({ projectType: "single_family_house", scale: "large", weeksByPhase: [3, 4, 6, 8, 9, 40, 5], total: 75 })} />);
    await user.click(within(region("Identificación")).getByRole("button", { name: /^Editar/ }));
    await user.selectOptions(screen.getByLabelText("Escala"), "Grande");
    await user.click(await screen.findByRole("button", { name: "Confirmar recálculo" }));
    await waitFor(() => expect(within(region("Tiempo")).getByText("75 semanas")).toBeInTheDocument());
  });

  it("no axe violations editable, and with one block in edit mode", async () => {
    const user = userEvent.setup();
    const { container } = render(<ProjectSheet sheet={SHEET} editable />);
    expect(await axe(container)).toHaveNoViolations();
    await user.click(within(region("Gobierno")).getByRole("button", { name: /^Editar/ }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
