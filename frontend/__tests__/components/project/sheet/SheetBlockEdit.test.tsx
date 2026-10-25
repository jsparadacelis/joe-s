/**
 * RGB-17b contract of `@/components/project/sheet/SheetBlock` (extended):
 *   <SheetBlock block code? editable? save? onSaved? loadPlan? />
 *     block: SheetBlockData; code: string (project code, for the default save)
 *     editable?: boolean (default false)  -> «Editar» button only if true AND the block has manual fields
 *     save?: (update: SheetUpdate) => Promise<ProjectSheet>    default: saveProjectSheet(code, update)
 *     onSaved?: (sheet: ProjectSheet) => void                  called with the sheet the API returned
 *     loadPlan?: (projectType, scale) => Promise<ProposedPlan> default: fetchProposedPlan  (lib/start)
 *   «Editar» button: accessible name starts with «Editar» (e.g. «Editar Encargo»), inside the block region.
 *   Edit mode: the view of the block is replaced by a form: one control per manual field labelled with its
 *   Spanish label (date -> input type=date; scope_included/scope_excluded/main_risk -> textarea; others text),
 *   prefilled; «Guardar» and «Cancelar» buttons. Identification also has selects «Tipología» and «Escala».
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { SheetBlock } from "@/components/project/sheet/SheetBlock";
import { ApiError } from "@/lib/api";
import type { ProjectSheet, SheetBlockData } from "@/lib/sheet";
import type { ProposedPlan } from "@/lib/start";
import { API_SHEET } from "../../../helpers/sheet-fixtures";

const WEEKS_MESSAGE = "Cada plantilla necesita exactamente 7 valores de semanas, enteros y entre 1 y 520.";
const block = (id: string) => API_SHEET.blocks.find((b) => b.block === id) as unknown as SheetBlockData;
const SAVED = API_SHEET as unknown as ProjectSheet;
const region = (name: string) => screen.getByRole("region", { name });
const editButton = (name: string) => within(region(name)).getByRole("button", { name: /^Editar/ });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

function setup(id: string, props: Record<string, unknown> = {}) {
  const save = jest.fn().mockResolvedValue(SAVED);
  const onSaved = jest.fn();
  const loadPlan = jest.fn();
  const utils = render(
    <SheetBlock block={block(id)} code="PRY-2026-001" editable save={save} onSaved={onSaved} loadPlan={loadPlan} {...props} />,
  );
  return { save, onSaved, loadPlan, user: userEvent.setup(), ...utils };
}

describe("<SheetBlock> edit button", () => {
  it("is absent when not editable (default)", () => {
    render(<SheetBlock block={block("engagement")} code="PRY-2026-001" />);
    expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
  });

  it.each(["identification", "engagement", "governance", "client_contact", "timing", "risk", "information"])(
    "%s has an «Editar» button when editable",
    (id) => {
      render(<SheetBlock block={block(id)} code="PRY-2026-001" editable />);
      expect(screen.getByRole("button", { name: /^Editar/ })).toBeInTheDocument();
    },
  );

  it("the status block has no manual fields, so no «Editar» even when editable", () => {
    render(<SheetBlock block={block("status")} code="PRY-2026-001" editable />);
    expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
  });
});

describe("<SheetBlock> edit form", () => {
  it("opens a form with one labelled control per manual field, prefilled, and hides the view", async () => {
    const { user } = setup("governance");
    await user.click(editButton("Gobierno"));
    for (const label of ["Promotor", "Dirección del proyecto", "Responsable técnico", "Equipo", "Colaboradores externos"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText("Obligatorio · falta")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled();
  });

  it("prefills the current values", async () => {
    const withValue = {
      ...block("governance"),
      fields: block("governance").fields.map((f) => (f.field === "sponsor" ? { ...f, value: "Promotora de prueba" } : f)),
    };
    const { user } = setup("governance", { block: withValue });
    await user.click(editButton("Gobierno"));
    expect(screen.getByLabelText("Promotor")).toHaveValue("Promotora de prueba");
    expect(screen.getByLabelText("Equipo")).toHaveValue("");
  });

  it("dates use type=date, scopes and main risk use textarea, the rest are text inputs", async () => {
    const { user, unmount } = setup("engagement");
    await user.click(editButton("Encargo"));
    expect(screen.getByLabelText("Fecha de firma del contrato")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Alcance incluido").tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText("Alcance excluido").tagName).toBe("TEXTAREA");
    unmount();

    const risk = setup("risk");
    await risk.user.click(editButton("Riesgo"));
    expect(screen.getByLabelText("Riesgo principal").tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText("Responsable del riesgo").tagName).toBe("INPUT");
  });

  it("only manual fields are editable: timing shows the milestone fields but not the confirmed plan", async () => {
    const { user } = setup("timing");
    await user.click(editButton("Tiempo"));
    expect(screen.getByLabelText("Próximo hito")).toBeInTheDocument();
    expect(screen.getByLabelText("Fecha del próximo hito")).toHaveAttribute("type", "date");
    expect(screen.queryByLabelText("Plan confirmado")).not.toBeInTheDocument();
  });

  it("«Guardar» sends only the fields that were touched, then calls onSaved with the returned sheet", async () => {
    const { user, save, onSaved } = setup("governance");
    await user.click(editButton("Gobierno"));
    await user.type(screen.getByLabelText("Promotor"), "Promotora de prueba");
    await user.type(screen.getByLabelText("Responsable técnico"), "Persona técnica");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(SAVED));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ fields: { sponsor: "Promotora de prueba", technical_lead: "Persona técnica" } });
  });

  it("a date is sent as an ISO string and clearing a value sends an empty string", async () => {
    const withValue = {
      ...block("engagement"),
      fields: block("engagement").fields.map((f) => (f.field === "scope_excluded" ? { ...f, value: "Fuera de alcance" } : f)),
    };
    const { user, save } = setup("engagement", { block: withValue });
    await user.click(editButton("Encargo"));
    fireEvent.change(screen.getByLabelText("Fecha de firma del contrato"), { target: { value: "2026-11-03" } });
    await user.clear(screen.getByLabelText("Alcance excluido"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith({ fields: { contract_signed_on: "2026-11-03", scope_excluded: "" } });
  });

  it("saving without touching anything sends nothing and returns to the view", async () => {
    const { user, save } = setup("governance");
    await user.click(editButton("Gobierno"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  });

  it("while saving, the form is disabled; on success it returns to the view with a live notice and focus", async () => {
    const pending = deferred<ProjectSheet>();
    const { user, save, onSaved } = setup("governance", { save: jest.fn().mockReturnValue(pending.promise) });
    await user.click(editButton("Gobierno"));
    await user.type(screen.getByLabelText("Promotor"), "Promotora de prueba");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByRole("button", { name: /Guardando/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(screen.getByLabelText("Promotor")).toBeDisabled();
    expect(save).not.toHaveBeenCalled(); // the injected default is replaced; the pending one was used
    await act(async () => pending.resolve(SAVED));
    expect(onSaved).toHaveBeenCalledWith(SAVED);
    expect(screen.queryByLabelText("Promotor")).not.toBeInTheDocument();
    const heading = within(region("Gobierno")).getByRole("heading", { level: 3, name: "Gobierno" });
    const notice = within(region("Gobierno")).getByRole("status");
    expect(notice).toHaveTextContent("Cambios guardados");
    expect([heading, notice]).toContain(document.activeElement);
  });

  it("a double click on «Guardar» saves once", async () => {
    const pending = deferred<ProjectSheet>();
    const save = jest.fn().mockReturnValue(pending.promise);
    const { user } = setup("governance", { save });
    await user.click(editButton("Gobierno"));
    await user.type(screen.getByLabelText("Promotor"), "Promotora de prueba");
    const button = screen.getByRole("button", { name: "Guardar" });
    await user.dblClick(button);
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(SAVED));
  });

  it("422 with a field: message next to that field, aria-invalid, aria-describedby and focus on it", async () => {
    const save = jest.fn().mockRejectedValue(new ApiError(422, "invalid_field", "La fecha no es válida.", "contract_signed_on"));
    const { user, onSaved } = setup("engagement", { save });
    await user.click(editButton("Encargo"));
    await user.type(screen.getByLabelText("Alcance incluido"), "Obra completa de prueba");
    fireEvent.change(screen.getByLabelText("Fecha de firma del contrato"), { target: { value: "2026-02-30" } });
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    const input = await screen.findByLabelText("Fecha de firma del contrato");
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent("La fecha no es válida.");
    expect(input).toHaveFocus();
    expect(screen.getByLabelText("Alcance incluido")).toHaveValue("Obra completa de prueba");
    expect(screen.getByLabelText("Alcance incluido")).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("editing the field with the error clears its error", async () => {
    const save = jest.fn().mockRejectedValue(new ApiError(422, "invalid_field", "El texto es demasiado largo.", "sponsor"));
    const { user } = setup("governance", { save });
    await user.click(editButton("Gobierno"));
    await user.type(screen.getByLabelText("Promotor"), "x");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("El texto es demasiado largo.");
    await user.type(screen.getByLabelText("Promotor"), "y");
    expect(screen.queryByText("El texto es demasiado largo.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Promotor")).not.toHaveAttribute("aria-invalid", "true");
  });

  it.each([
    [new ApiError(403, "no_authority", "Solo un socio o un director puede editar la ficha.")],
    [new ApiError(409, "sheet_not_editable", "La ficha solo se edita mientras el proyecto está en Inicio.")],
    [new ApiError(0, "network_error", "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.")],
  ])("%s: red alert with the server text and the form is kept with its values", async (error) => {
    const save = jest.fn().mockRejectedValue(error);
    const { user, onSaved } = setup("governance", { save });
    await user.click(editButton("Gobierno"));
    await user.type(screen.getByLabelText("Promotor"), "Promotora de prueba");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    const alert = await within(region("Gobierno")).findByRole("alert");
    expect(alert).toHaveTextContent(error.message);
    expect(screen.getByLabelText("Promotor")).toHaveValue("Promotora de prueba");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("an unexpected error (not an ApiError) shows a generic Spanish alert", async () => {
    const { user } = setup("governance", { save: jest.fn().mockRejectedValue(new Error("boom")) });
    await user.click(editButton("Gobierno"));
    await user.type(screen.getByLabelText("Promotor"), "x");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ocurrió un error inesperado. Inténtalo de nuevo.");
  });

  it("«Cancelar» discards the changes, saves nothing and returns focus to «Editar»", async () => {
    const { user, save } = setup("governance");
    await user.click(editButton("Gobierno"));
    await user.type(screen.getByLabelText("Promotor"), "Promotora de prueba");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Promotor")).not.toBeInTheDocument();
    expect(editButton("Gobierno")).toHaveFocus();
    await user.click(editButton("Gobierno"));
    expect(screen.getByLabelText("Promotor")).toHaveValue("");
  });

  it("Escape cancels the edit and returns focus to «Editar»", async () => {
    const { user } = setup("governance");
    await user.click(editButton("Gobierno"));
    await user.type(screen.getByLabelText("Promotor"), "x");
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("Promotor")).not.toBeInTheDocument();
    expect(editButton("Gobierno")).toHaveFocus();
  });

  it("works with the keyboard alone: Tab to «Editar», Enter, type, Tab to «Guardar», Enter", async () => {
    const { user, save } = setup("risk");
    await user.tab();
    expect(editButton("Riesgo")).toHaveFocus();
    await user.keyboard("{Enter}");
    // Whether focus lands on the first field or stays on the button, Tab reaches every control in DOM order.
    const tabTo = async (target: HTMLElement) => {
      for (let i = 0; i < 6 && document.activeElement !== target; i += 1) await user.tab();
      expect(target).toHaveFocus();
    };
    await tabTo(screen.getByLabelText("Riesgo principal"));
    await user.keyboard("Riesgo de prueba");
    expect(screen.getByLabelText("Riesgo principal")).toHaveValue("Riesgo de prueba");
    await tabTo(screen.getByRole("button", { name: "Guardar" }));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(save).toHaveBeenCalledWith({ fields: { main_risk: "Riesgo de prueba" } }));
  });

  it("every control has an accessible name and there are no axe violations in view and in edit", async () => {
    const { user, container } = setup("engagement");
    expect(await axe(container)).toHaveNoViolations();
    await user.click(editButton("Encargo"));
    for (const control of within(region("Encargo")).getAllByRole("textbox")) expect(control).toHaveAccessibleName();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("<SheetBlock> identification: type and scale", () => {
  const plan = (projectType: string, scale: string, weeks = [3, 4, 6, 8, 9, 40, 5]): ProposedPlan => ({
    projectType: projectType as ProposedPlan["projectType"],
    scale: scale as ProposedPlan["scale"],
    weeksByPhase: weeks,
    total: weeks.reduce((a, b) => a + b, 0),
  });
  const PHASE_NAMES = ["Inicio", "Briefing y concepto", "Anteproyecto", "Proyecto básico", "Proyecto de ejecución", "Obra", "Cierre"];

  async function openIdentification(loadPlan: jest.Mock, save = jest.fn().mockResolvedValue(SAVED)) {
    const utils = setup("identification", { loadPlan, save });
    await utils.user.click(editButton("Identificación"));
    return { ...utils, save };
  }

  it("shows selects with the Spanish labels, preselected with the current values, plus the cadastral reference", async () => {
    await openIdentification(jest.fn());
    const type = screen.getByLabelText("Tipología") as HTMLSelectElement;
    const scale = screen.getByLabelText("Escala") as HTMLSelectElement;
    expect(type.tagName).toBe("SELECT");
    expect(type).toHaveDisplayValue("Vivienda unifamiliar");
    expect(scale).toHaveDisplayValue("Media");
    expect(within(type).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Vivienda unifamiliar", "Rehabilitación", "Plurifamiliar", "Dotacional", "Industrial", "Reforma de interiores",
    ]);
    expect(within(scale).getAllByRole("option").map((o) => o.textContent)).toEqual(["Pequeña", "Media", "Grande"]);
    expect(screen.getByLabelText("Referencia catastral")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nombre")).not.toBeInTheDocument();
  });

  it("no plan is asked and no recalculation shown until type or scale change", async () => {
    const loadPlan = jest.fn();
    await openIdentification(loadPlan);
    expect(loadPlan).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Confirmar recálculo" })).not.toBeInTheDocument();
  });

  it("changing the scale asks for the proposed plan with the unchanged type and shows 7 editable weeks and a clear warning", async () => {
    const loadPlan = jest.fn().mockResolvedValue(plan("single_family_house", "large"));
    const { user } = await openIdentification(loadPlan);
    await user.selectOptions(screen.getByLabelText("Escala"), "Grande");
    await waitFor(() => expect(loadPlan).toHaveBeenCalledWith("single_family_house", "large"));
    for (const [i, name] of PHASE_NAMES.entries()) {
      expect(await screen.findByLabelText(`Semanas de ${name}`)).toHaveValue(plan("", "").weeksByPhase[i]);
    }
    expect(screen.getByText(/recalcula el plan/i)).toHaveTextContent(/reemplaza el plan de trabajo/i);
    expect(screen.getByText(/recalcula el plan/i)).toHaveTextContent(/línea base se conserva/i);
    expect(screen.getByText("Total: 75 semanas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar recálculo" })).toBeEnabled();
  });

  it("changing the type asks the plan with the new type and the unchanged scale", async () => {
    const loadPlan = jest.fn().mockResolvedValue(plan("rehabilitation", "medium"));
    const { user } = await openIdentification(loadPlan);
    await user.selectOptions(screen.getByLabelText("Tipología"), "Rehabilitación");
    await waitFor(() => expect(loadPlan).toHaveBeenCalledWith("rehabilitation", "medium"));
    expect(await screen.findByRole("button", { name: "Confirmar recálculo" })).toBeInTheDocument();
  });

  it("nothing is saved by choosing: «Confirmar recálculo» sends PUT fields-free plan {project_type, scale, weeks}", async () => {
    const loadPlan = jest.fn().mockResolvedValue(plan("rehabilitation", "large"));
    const { user, save, onSaved } = await openIdentification(loadPlan);
    await user.selectOptions(screen.getByLabelText("Tipología"), "Rehabilitación");
    await user.selectOptions(screen.getByLabelText("Escala"), "Grande");
    const obra = await screen.findByLabelText("Semanas de Obra");
    expect(save).not.toHaveBeenCalled();
    await user.clear(obra);
    await user.type(obra, "42");
    await user.click(screen.getByRole("button", { name: "Confirmar recálculo" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(SAVED));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ plan: { project_type: "rehabilitation", scale: "large", weeks: [3, 4, 6, 8, 9, 42, 5] } });
  });

  it("the touched manual fields travel together with the plan", async () => {
    const loadPlan = jest.fn().mockResolvedValue(plan("single_family_house", "small"));
    const { user, save } = await openIdentification(loadPlan);
    await user.type(screen.getByLabelText("Referencia catastral"), "0000000AA0000A0000AA");
    await user.selectOptions(screen.getByLabelText("Escala"), "Pequeña");
    await user.click(await screen.findByRole("button", { name: "Confirmar recálculo" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith({
      fields: { cadastral_reference: "0000000AA0000A0000AA" },
      plan: { project_type: "single_family_house", scale: "small", weeks: [3, 4, 6, 8, 9, 40, 5] },
    });
  });

  it("changing only the cadastral reference saves just the field, with no plan", async () => {
    const { user, save, loadPlan } = await openIdentification(jest.fn());
    await user.type(screen.getByLabelText("Referencia catastral"), "0000000AA0000A0000AA");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith({ fields: { cadastral_reference: "0000000AA0000A0000AA" } });
    expect(loadPlan).not.toHaveBeenCalled();
  });

  it.each([
    ["0", "1"],
    ["521", "520"],
    ["", "1"],
    ["2.5", "1"],
  ])("invalid week %p: shows the validateWeeks message, marks the input and sends nothing", async (bad) => {
    const loadPlan = jest.fn().mockResolvedValue(plan("single_family_house", "large"));
    const { user, save } = await openIdentification(loadPlan);
    await user.selectOptions(screen.getByLabelText("Escala"), "Grande");
    const field = await screen.findByLabelText("Semanas de Anteproyecto");
    await user.clear(field);
    if (bad !== "") await user.type(field, bad);
    await user.click(screen.getByRole("button", { name: "Confirmar recálculo" }));
    expect(await screen.findByText(WEEKS_MESSAGE)).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveFocus();
    expect(save).not.toHaveBeenCalled();
  });

  it("«Cancelar» during a recalculation saves nothing and goes back to the view", async () => {
    const loadPlan = jest.fn().mockResolvedValue(plan("single_family_house", "large"));
    const { user, save } = await openIdentification(loadPlan);
    await user.selectOptions(screen.getByLabelText("Escala"), "Grande");
    await screen.findByRole("button", { name: "Confirmar recálculo" });
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Confirmar recálculo" })).not.toBeInTheDocument();
    expect(editButton("Identificación")).toHaveFocus();
  });

  it("if the proposed plan fails: alert with the message, no recalculation to confirm and no PUT", async () => {
    const loadPlan = jest.fn().mockRejectedValue(new ApiError(500, "unexpected_error", "No se pudo calcular el plan."));
    const { user, save } = await openIdentification(loadPlan);
    await user.selectOptions(screen.getByLabelText("Escala"), "Grande");
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo calcular el plan.");
    expect(screen.queryByRole("button", { name: "Confirmar recálculo" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Semanas de Obra")).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("a server error while confirming the recalculation keeps the plan and the weeks", async () => {
    const loadPlan = jest.fn().mockResolvedValue(plan("single_family_house", "large"));
    const save = jest.fn().mockRejectedValue(new ApiError(409, "sheet_not_editable", "La ficha solo se edita mientras el proyecto está en Inicio."));
    const { user } = await openIdentification(loadPlan, save);
    await user.selectOptions(screen.getByLabelText("Escala"), "Grande");
    await user.click(await screen.findByRole("button", { name: "Confirmar recálculo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La ficha solo se edita mientras el proyecto está en Inicio.");
    expect(screen.getByLabelText("Semanas de Obra")).toHaveValue(40);
    expect(screen.getByRole("button", { name: "Confirmar recálculo" })).toBeEnabled();
  });

  it("no axe violations in the recalculation state", async () => {
    const loadPlan = jest.fn().mockResolvedValue(plan("single_family_house", "large"));
    const { user, container } = await openIdentification(loadPlan);
    await user.selectOptions(screen.getByLabelText("Escala"), "Grande");
    await screen.findByRole("button", { name: "Confirmar recálculo" });
    expect(await axe(container)).toHaveNoViolations();
  });
});
