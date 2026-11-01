/**
 * RGB-32b contract of `@/components/project/brief/BriefForm` (to be created by the front developer):
 *   <BriefForm brief save? onSaved? />
 *     brief: Brief (from `@/lib/brief`); save?: (update: BriefUpdate) => Promise<Brief>  default: saveBrief(brief.code, update)
 *     onSaved?: (brief: Brief) => void   called with the brief the API returned, once per successful save
 *   DESIGN DECISION: one general form (no per-block «Editar» toggle): a single «Guardar brief» button saves only the
 *   fields that changed, in one request {fields: {...}}.
 *   Editable only when brief.permissions.can_edit is true. Then, inside <form aria-label="Brief">:
 *     one control per field, labelled with its exact Spanish label (BRIEF_FIELD_LABELS): needs, program, constraints,
 *     topographic_survey, alignment -> textarea; target_budget -> text input (inputMode decimal); deadline -> input
 *     type=date; client_approval -> select with options Pendiente / Por correo / En reunión / Con firma
 *     (values pending, email, meeting, signed). All prefilled (budget as the plain number «250000», null -> «»).
 *     The five required fields have aria-required="true"; every control has aria-describedby pointing to a hint
 *     element whose text is «Obligatorio» or «Opcional».
 *   Without can_edit: no form, no «Guardar brief», no inputs; a <dl> of read-only values under the Spanish labels
 *     (budget as «250.000 €»-style text is NOT required: it shows the number formatted with es-ES currency, i.e. the text
 *     matches /250\.000/ and /€/), empty values read «Sin rellenar», client approval shows its label (e.g. «Por correo»).
 *   Save: validates the changed fields with validateBriefField; the first invalid one gets aria-invalid="true", its message
 *     in an element referenced by aria-describedby (after the hint), focus on it, and NO request. Sends trimmed text,
 *     blank -> null, budget as number, deadline string, approval string. Nothing changed -> no request and
 *     role="status" «No hay cambios que guardar».
 *   While saving: button reads «Guardando…», controls disabled (fieldset), double submit sends once.
 *   Success: role="status" tabIndex -1 «Brief guardado», focused; onSaved(brief); controls re-synced to the returned brief.
 *   Errors: 422 invalid_field with `field` -> message next to that control (aria-invalid, aria-describedby), focus on it,
 *     form stays editable. Any other error (422 unknown_field/invalid_request, 404, unexpected) -> role="alert"
 *     tabIndex -1 focused with the server message, drafts kept. 403 -> same alert, and the form becomes read-only (the
 *     read-only <dl>, no «Guardar brief»). 409 brief_not_editable -> alert with the message, read-only, plus a «Recargar»
 *     button that calls router.refresh().
 */
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { BriefForm } from "@/components/project/brief/BriefForm";
import { ApiError } from "@/lib/api";
import type { Brief } from "@/lib/brief";
import { API_BRIEF_COMPLETE, API_BRIEF_INCOMPLETE, API_BRIEF_READ_ONLY, brief } from "../../../helpers/brief-fixtures";

beforeEach(() => mockRefresh.mockClear());

const asBrief = (b: unknown) => b as Brief;
const COMPLETE = asBrief(API_BRIEF_COMPLETE);
const INCOMPLETE = asBrief(API_BRIEF_INCOMPLETE);
const SAVE = "Guardar brief";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

function setup(source: Brief = COMPLETE, save: jest.Mock = jest.fn().mockResolvedValue(source), onSaved = jest.fn()) {
  const user = userEvent.setup();
  const view = render(<BriefForm brief={source} save={save} onSaved={onSaved} />);
  return { user, save, onSaved, ...view };
}
const control = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const saveButton = () => screen.getByRole("button", { name: SAVE });
const failing = (status: number, code: string, message: string, field?: string) => jest.fn().mockRejectedValue(new ApiError(status, code, message, field));

describe("<BriefForm> editable", () => {
  it("renders one labelled control per field, prefilled", () => {
    setup();
    expect(screen.getByRole("form", { name: "Brief" })).toBeInTheDocument();
    expect(control("Necesidades").tagName).toBe("TEXTAREA");
    expect(control("Necesidades")).toHaveValue("Vivienda unifamiliar para una familia de cuatro personas");
    expect(control("Programa").tagName).toBe("TEXTAREA");
    expect(control("Condicionantes")).toHaveValue("Retranqueo de 3 m a lindero");
    expect(control("Presupuesto objetivo").tagName).toBe("INPUT");
    expect(control("Presupuesto objetivo")).toHaveValue("250000");
    expect(control("Plazo")).toHaveAttribute("type", "date");
    expect(control("Plazo")).toHaveValue("2027-06-30");
    expect(control("Levantamiento topográfico").tagName).toBe("TEXTAREA");
    expect(control("Levantamiento topográfico")).toHaveValue("");
    expect(control("Alineación")).toHaveValue("");
    expect(control("Aprobación del cliente").tagName).toBe("SELECT");
    expect(control("Aprobación del cliente")).toHaveValue("email");
  });

  it("the approval select offers the four options in order", () => {
    setup();
    const options = within(control("Aprobación del cliente")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Pendiente", "Por correo", "En reunión", "Con firma"]);
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual(["pending", "email", "meeting", "signed"]);
  });

  it("empty fields come as empty controls", () => {
    setup(INCOMPLETE);
    expect(control("Programa")).toHaveValue("");
    expect(control("Presupuesto objetivo")).toHaveValue("");
    expect(control("Aprobación del cliente")).toHaveValue("pending");
  });

  it("marks the five required fields and hints required/optional", () => {
    setup();
    for (const label of ["Necesidades", "Programa", "Condicionantes", "Presupuesto objetivo", "Plazo"]) {
      expect(control(label)).toHaveAttribute("aria-required", "true");
      expect(control(label)).toHaveAccessibleDescription(/Obligatorio/);
    }
    for (const label of ["Levantamiento topográfico", "Alineación", "Aprobación del cliente"]) {
      expect(control(label)).not.toHaveAttribute("aria-required", "true");
      expect(control(label)).toHaveAccessibleDescription(/Opcional/);
    }
  });

  it("has a «Guardar brief» button", () => {
    setup();
    expect(saveButton()).toBeEnabled();
  });
});

describe("<BriefForm> saving", () => {
  it("sends only the changed fields, trimmed, and shows «Brief guardado» focused", async () => {
    const saved = brief({ fields: { needs: "Reforma integral" } });
    const { user, save, onSaved } = setup(COMPLETE, jest.fn().mockResolvedValue(saved));
    await user.clear(control("Necesidades"));
    await user.type(control("Necesidades"), "  Reforma integral  ");
    await user.click(saveButton());
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ fields: { needs: "Reforma integral" } });
    expect(onSaved).toHaveBeenCalledWith(saved);
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Brief guardado");
    await waitFor(() => expect(status).toHaveFocus());
  });

  it("sends the budget as a number, the deadline as text and the approval as its value", async () => {
    const { user, save } = setup();
    await user.clear(control("Presupuesto objetivo"));
    await user.type(control("Presupuesto objetivo"), "300000.50");
    await user.clear(control("Plazo"));
    await user.type(control("Plazo"), "2028-01-15");
    await user.selectOptions(control("Aprobación del cliente"), "signed");
    await user.click(saveButton());
    expect(save).toHaveBeenCalledWith({ fields: { target_budget: 300000.5, deadline: "2028-01-15", client_approval: "signed" } });
  });

  it("clearing a field sends null", async () => {
    const { user, save } = setup();
    await user.clear(control("Condicionantes"));
    await user.click(saveButton());
    expect(save).toHaveBeenCalledWith({ fields: { constraints: null } });
  });

  it("clearing the budget sends null", async () => {
    const { user, save } = setup();
    await user.clear(control("Presupuesto objetivo"));
    await user.click(saveButton());
    expect(save).toHaveBeenCalledWith({ fields: { target_budget: null } });
  });

  it("an optional field gets filled", async () => {
    const { user, save } = setup();
    await user.type(control("Alineación"), "Alineada a vial");
    await user.click(saveButton());
    expect(save).toHaveBeenCalledWith({ fields: { alignment: "Alineada a vial" } });
  });

  it("nothing changed: no request and a status says so", async () => {
    const { user, save } = setup();
    await user.click(saveButton());
    expect(save).not.toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent("No hay cambios que guardar");
  });

  it("the controls follow the brief the API returned", async () => {
    const saved = brief({ fields: { needs: "Texto normalizado por el servidor" } });
    const { user } = setup(COMPLETE, jest.fn().mockResolvedValue(saved));
    await user.type(control("Necesidades"), " ampliado");
    await user.click(saveButton());
    await screen.findByRole("status");
    expect(control("Necesidades")).toHaveValue("Texto normalizado por el servidor");
  });

  it("while saving the button reads «Guardando…», the controls are disabled and a double click sends once", async () => {
    const pending = deferred<Brief>();
    const { user, save } = setup(COMPLETE, jest.fn().mockReturnValue(pending.promise));
    await user.type(control("Alineación"), "x");
    await user.dblClick(saveButton());
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    expect(control("Necesidades")).toBeDisabled();
    pending.resolve(COMPLETE);
    expect(await screen.findByRole("status")).toHaveTextContent("Brief guardado");
    expect(control("Necesidades")).toBeEnabled();
    expect(saveButton()).toBeEnabled();
  });

  it("Enter in the budget input submits the form once", async () => {
    const { user, save } = setup();
    await user.clear(control("Presupuesto objetivo"));
    await user.type(control("Presupuesto objetivo"), "100{Enter}");
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ fields: { target_budget: 100 } });
  });
});

describe("<BriefForm> client validation", () => {
  it("an invalid budget shows its message next to the field, takes focus and sends nothing", async () => {
    const { user, save } = setup();
    await user.clear(control("Presupuesto objetivo"));
    await user.type(control("Presupuesto objetivo"), "250.000 €");
    await user.click(saveButton());
    expect(save).not.toHaveBeenCalled();
    const input = control("Presupuesto objetivo");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/El presupuesto objetivo debe ser un número mayor que 0, con punto decimal y hasta 2 decimales\./);
    expect(input).toHaveFocus();
  });

  it("an over-the-cap budget shows the cap message", async () => {
    const { user, save } = setup();
    await user.clear(control("Presupuesto objetivo"));
    await user.type(control("Presupuesto objetivo"), "1000000000.01");
    await user.click(saveButton());
    expect(save).not.toHaveBeenCalled();
    expect(control("Presupuesto objetivo")).toHaveAccessibleDescription(/no puede superar 1\.000\.000\.000 €/);
  });

  it("a text over 2000 characters is rejected and focus goes to the first invalid control", async () => {
    const { user, save } = setup();
    await user.click(control("Programa"));
    await user.paste("a".repeat(2001));
    await user.clear(control("Presupuesto objetivo"));
    await user.type(control("Presupuesto objetivo"), "abc");
    await user.click(saveButton());
    expect(save).not.toHaveBeenCalled();
    expect(control("Programa")).toHaveAttribute("aria-invalid", "true");
    expect(control("Programa")).toHaveAccessibleDescription(/El campo «Programa» no puede superar 2000 caracteres\./);
    expect(control("Programa")).toHaveFocus();
    expect(control("Presupuesto objetivo")).toHaveAttribute("aria-invalid", "true");
  });

  it("exactly 2000 characters is accepted", async () => {
    const { user, save } = setup();
    await user.click(control("Alineación"));
    await user.paste("a".repeat(2000));
    await user.click(saveButton());
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("an out-of-range deadline is rejected", async () => {
    const { user, save } = setup();
    const input = control("Plazo");
    await user.clear(input);
    await user.type(input, "2101-01-01");
    await user.click(saveButton());
    expect(save).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/El plazo debe ser una fecha real con el formato AAAA-MM-DD, entre los años 2000 y 2100\./);
  });

  it("editing an invalid control clears its error", async () => {
    const { user } = setup();
    await user.clear(control("Presupuesto objetivo"));
    await user.type(control("Presupuesto objetivo"), "abc");
    await user.click(saveButton());
    expect(control("Presupuesto objetivo")).toHaveAttribute("aria-invalid", "true");
    await user.clear(control("Presupuesto objetivo"));
    await user.type(control("Presupuesto objetivo"), "100");
    expect(control("Presupuesto objetivo")).not.toHaveAttribute("aria-invalid", "true");
    expect(control("Presupuesto objetivo")).not.toHaveAccessibleDescription(/El presupuesto/);
  });
});

describe("<BriefForm> server errors", () => {
  it("422 invalid_field: the message goes next to the field named by the server, with focus", async () => {
    const message = "El campo «Plazo» no es válido: debe ser una fecha con el formato AAAA-MM-DD.";
    const { user } = setup(COMPLETE, failing(422, "invalid_field", message, "deadline"));
    await user.type(control("Alineación"), "x");
    await user.click(saveButton());
    await waitFor(() => expect(control("Plazo")).toHaveFocus());
    expect(control("Plazo")).toHaveAttribute("aria-invalid", "true");
    expect(control("Plazo")).toHaveAccessibleDescription(new RegExp(message));
    expect(control("Alineación")).toHaveValue("x");
    expect(saveButton()).toBeEnabled();
    expect(control("Plazo")).toBeEnabled();
  });

  it("422 invalid_field on a text field", async () => {
    const message = "El campo «Programa» no es válido: es demasiado largo.";
    const { user } = setup(COMPLETE, failing(422, "invalid_field", message, "program"));
    await user.type(control("Programa"), "x");
    await user.click(saveButton());
    await waitFor(() => expect(control("Programa")).toHaveFocus());
    expect(control("Programa")).toHaveAccessibleDescription(new RegExp("es demasiado largo"));
  });

  it("422 unknown_field: a focused alert with the message, form still editable", async () => {
    const message = "El campo «x» no existe o no se puede editar aquí.";
    const { user } = setup(COMPLETE, failing(422, "unknown_field", message, "x"));
    await user.type(control("Alineación"), "x");
    await user.click(saveButton());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(saveButton()).toBeEnabled();
  });

  it("422 invalid_request: a focused alert", async () => {
    const { user } = setup(COMPLETE, failing(422, "invalid_request", "La petición no es válida."));
    await user.type(control("Alineación"), "x");
    await user.click(saveButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("La petición no es válida.");
  });

  it("403 no_authority: alert with the message and the form turns read-only", async () => {
    const message = "Solo el director de proyecto de este proyecto puede editar el brief.";
    const { user } = setup(COMPLETE, failing(403, "no_authority", message));
    await user.type(control("Alineación"), "x");
    await user.click(saveButton());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.queryByRole("button", { name: SAVE })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Necesidades")).not.toBeInTheDocument();
    expect(screen.getByText("Necesidades")).toBeInTheDocument();
  });

  it("409 brief_not_editable: alert, read-only and «Recargar» refreshes the page", async () => {
    const message = "El brief solo se puede editar o promover mientras el proyecto está en la fase 2.";
    const { user } = setup(COMPLETE, failing(409, "brief_not_editable", message));
    await user.type(control("Alineación"), "x");
    await user.click(saveButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByRole("button", { name: SAVE })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Recargar" }));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("404 and unexpected errors: alert with the message, drafts kept, can retry", async () => {
    const { user, save } = setup(COMPLETE, failing(404, "project_not_found", "No existe el proyecto PRY-2026-001."));
    await user.type(control("Alineación"), "x");
    await user.click(saveButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("No existe el proyecto PRY-2026-001.");
    expect(control("Alineación")).toHaveValue("x");
    await user.click(saveButton());
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("a non-ApiError failure shows the generic Spanish message", async () => {
    const { user } = setup(COMPLETE, jest.fn().mockRejectedValue(new Error("boom")));
    await user.type(control("Alineación"), "x");
    await user.click(saveButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Ocurrió un error inesperado. Inténtalo de nuevo.");
  });

  it("a success after an error removes the alert", async () => {
    const save = jest.fn().mockRejectedValueOnce(new ApiError(404, "project_not_found", "No existe.")).mockResolvedValueOnce(COMPLETE);
    const { user } = setup(COMPLETE, save);
    await user.type(control("Alineación"), "x");
    await user.click(saveButton());
    await screen.findByRole("alert");
    await user.click(saveButton());
    await screen.findByText("Brief guardado");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("<BriefForm> read-only", () => {
  const RO = asBrief(API_BRIEF_READ_ONLY);

  it("without can_edit there is no form, no inputs and no save button", () => {
    render(<BriefForm brief={RO} />);
    expect(screen.queryByRole("form", { name: "Brief" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows every field under its Spanish label", () => {
    render(<BriefForm brief={RO} />);
    for (const label of BRIEF_LABELS) expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText("Vivienda unifamiliar para una familia de cuatro personas")).toBeInTheDocument();
    expect(screen.getByText(/250\.000/)).toHaveTextContent("€");
    expect(screen.getByText(/2027/)).toBeInTheDocument();
    expect(screen.getByText("Por correo")).toBeInTheDocument();
  });

  it("a long unbroken text wraps instead of widening the page", () => {
    const long = "W".repeat(2000);
    render(<BriefForm brief={asBrief(brief({ permissions: { can_edit: false }, fields: { needs: long } }))} />);
    const value = screen.getByText(long);
    expect(value.tagName).toBe("DD");
    expect(value).toHaveClass("break-words");
  });

  it("empty values read «Sin rellenar»", () => {
    render(<BriefForm brief={asBrief(brief({ permissions: { can_edit: false }, fields: { program: null, topographic_survey: null } }))} />);
    expect(screen.getAllByText("Sin rellenar").length).toBeGreaterThanOrEqual(3);
  });

  it("a frozen brief is read-only too", () => {
    render(<BriefForm brief={asBrief(brief({ phase: 3, frozen_version: 1, permissions: { can_edit: false, can_promote: false } }))} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

const BRIEF_LABELS = [
  "Necesidades",
  "Programa",
  "Condicionantes",
  "Presupuesto objetivo",
  "Plazo",
  "Levantamiento topográfico",
  "Alineación",
  "Aprobación del cliente",
];

describe("<BriefForm> accessibility", () => {
  it("no violations editable, with an error, and read-only", async () => {
    const { user, container, unmount } = setup();
    expect(await axe(container)).toHaveNoViolations();
    await user.clear(control("Presupuesto objetivo"));
    await user.type(control("Presupuesto objetivo"), "abc");
    await user.click(saveButton());
    expect(await axe(container)).toHaveNoViolations();
    unmount();
    const ro = render(<BriefForm brief={asBrief(API_BRIEF_READ_ONLY)} />);
    expect(await axe(ro.container)).toHaveNoViolations();
  });
});
