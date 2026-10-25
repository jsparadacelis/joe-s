/**
 * RGB-19 contract of `@/components/project/sheet/PromotePanel` (to be created by the front developer):
 *   <PromotePanel sheet promote? onPromoted? />
 *     sheet: ProjectSheet (from `@/lib/sheet`); promote?: () => Promise<PromoteResult>  default: promoteProjectSheet(sheet.code)
 *     onPromoted?: (result: PromoteResult) => void   called once on success (the parent swaps in result.sheet)
 *   Renders a <section aria-label="Promoción a Briefing"> with: the percentage («35 %») and counts, the missing
 *   required fields grouped by block (block label in its own element, inside the <li> that lists its field labels),
 *   and the button «Promover a 2 · Briefing y concepto».
 *   The button is disabled while permissions.can_promote is false; the reason is visible text and is the button's
 *   aria-describedby: incomplete -> «Faltan N campos obligatorios» («Falta 1 campo obligatorio»);
 *   complete but not can_promote -> «Solo un socio o un director puede promover».
 *   Click -> role="group" «Confirmar promoción» (focus on «Confirmar promoción»; «Cancelar» and Escape close it and
 *   return focus to the promote button); nothing is sent before confirming. Sending disables the buttons («Promoviendo…»);
 *   a double click sends once. Success -> role="status" tabIndex -1 focused with the exact text
 *   «La ficha v1 quedó congelada y el proyecto pasó a Briefing y concepto» plus a link «Ir a Briefing y concepto» to
 *   /projects/{code}/phase/2; the promote button and confirmation disappear. ApiError -> role="alert" focused with the
 *   server message (and the `missing` labels, if any); the confirmation stays open and the button is usable again.
 *   With sheet.frozen_version !== null and no promotion made here, renders nothing.
 *   The idle panel has no role="status" (the sheet summary is the first status of <ProjectSheet>).
 */
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { PromotePanel } from "@/components/project/sheet/PromotePanel";
import { ApiError } from "@/lib/api";
import type { ProjectSheet as ProjectSheetModel } from "@/lib/sheet";
import { API_SHEET, API_SHEET_COMPLETE, API_SHEET_EDITABLE, API_SHEET_FROZEN } from "../../../helpers/sheet-fixtures";

beforeEach(() => mockRefresh.mockClear());

const asSheet = (s: unknown) => s as ProjectSheetModel;
const INCOMPLETE = asSheet(API_SHEET_EDITABLE);
const COMPLETE = asSheet(API_SHEET_COMPLETE);
const RESULT = { code: "PRY-2026-001", action: "promote" as const, previous_phase: 1, current_phase: 2, frozen_version: 1, sheet: asSheet(API_SHEET_FROZEN) };
const PROMOTE = "Promover a 2 · Briefing y concepto";
const SUCCESS = "La ficha v1 quedó congelada y el proyecto pasó a Briefing y concepto";

function setup(sheet: ProjectSheetModel, promote: jest.Mock = jest.fn().mockResolvedValue(RESULT), onPromoted = jest.fn()) {
  const user = userEvent.setup();
  const view = render(<PromotePanel sheet={sheet} promote={promote} onPromoted={onPromoted} />);
  return { user, promote, onPromoted, ...view };
}
const promoteButton = () => screen.getByRole("button", { name: PROMOTE });
const deferred = () => {
  let resolve!: (v: typeof RESULT) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<typeof RESULT>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

describe("<PromotePanel> completeness", () => {
  it("shows the percentage and counts", () => {
    setup(INCOMPLETE);
    const panel = within(screen.getByRole("region", { name: "Promoción a Briefing" }));
    expect(panel.getByText(/35 %/)).toBeInTheDocument();
    expect(panel.getByText(/7 de 20 campos obligatorios/)).toBeInTheDocument();
  });

  it("lists the missing required fields grouped by block, and not the filled or optional ones", () => {
    setup(INCOMPLETE);
    const panel = within(screen.getByRole("region", { name: "Promoción a Briefing" }));
    const group = (block: string) => panel.getByText(block, { selector: "strong, span, p, h3, h4" }).closest("li") as HTMLElement;
    expect(group("Identificación")).toHaveTextContent("Referencia catastral");
    expect(group("Encargo")).toHaveTextContent(/Alcance incluido.*Alcance excluido.*Fecha de firma del contrato/);
    expect(group("Gobierno")).toHaveTextContent("Dirección del proyecto");
    expect(group("Gobierno")).not.toHaveTextContent("Equipo");
    expect(group("Tiempo")).toHaveTextContent("Próximo hito");
    expect(group("Tiempo")).not.toHaveTextContent("Plan confirmado");
    expect(panel.queryByText("Estado", { selector: "strong, span, p, h3, h4" })).not.toBeInTheDocument();
    expect(panel.queryByText("Nombre")).not.toBeInTheDocument();
  });

  it("a complete sheet lists nothing missing", () => {
    setup(COMPLETE);
    expect(screen.getByText(/100 %/)).toBeInTheDocument();
    expect(screen.queryByText(/Faltan por rellenar/)).not.toBeInTheDocument();
    expect(screen.queryByText("Referencia catastral")).not.toBeInTheDocument();
  });
});

describe("<PromotePanel> button state", () => {
  it("incomplete: disabled, with the reason as visible text linked by aria-describedby", () => {
    setup(INCOMPLETE);
    expect(promoteButton()).toBeDisabled();
    const reason = screen.getByText("Faltan 13 campos obligatorios");
    expect(promoteButton().getAttribute("aria-describedby")).toContain(reason.id);
    expect(reason.id).not.toBe("");
  });

  it("one missing field uses the singular", () => {
    const one = { ...COMPLETE, completion: { filled: 19, required: 20, percent: 95 } } as ProjectSheetModel;
    setup({ ...one, permissions: { can_edit: true, can_promote: false } });
    expect(screen.getByText("Falta 1 campo obligatorio")).toBeInTheDocument();
  });

  it("complete but without authority (can_edit false, can_promote false): disabled with the authority reason", () => {
    setup(asSheet({ ...API_SHEET_COMPLETE, permissions: { can_edit: false, can_promote: false } }));
    expect(promoteButton()).toBeDisabled();
    expect(screen.getByText("Solo un socio o un director puede promover")).toBeInTheDocument();
    expect(screen.queryByText(/Faltan \d+ campos/)).not.toBeInTheDocument();
  });

  it("can_promote: enabled and no reason", () => {
    setup(COMPLETE);
    expect(promoteButton()).toBeEnabled();
    expect(screen.queryByText(/Solo un socio o un director/)).not.toBeInTheDocument();
    expect(screen.queryByText(/campos? obligatorios?$/)).not.toBeInTheDocument();
  });

  it("a disabled button never sends", async () => {
    const { user, promote } = setup(INCOMPLETE);
    await user.click(promoteButton());
    expect(promote).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "Confirmar promoción" })).not.toBeInTheDocument();
  });

  it("a frozen sheet that was not promoted here renders nothing", () => {
    const { container } = setup(asSheet(API_SHEET_FROZEN));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("<PromotePanel> confirmation", () => {
  it("clicking asks for confirmation, focuses it and sends nothing yet", async () => {
    const { user, promote } = setup(COMPLETE);
    await user.click(promoteButton());
    const group = screen.getByRole("group", { name: "Confirmar promoción" });
    expect(group).toHaveTextContent(/congelará|quedará congelada/i);
    expect(within(group).getByRole("button", { name: "Confirmar promoción" })).toHaveFocus();
    expect(promote).not.toHaveBeenCalled();
  });

  it("«Cancelar» closes it, returns focus to the promote button and sends nothing", async () => {
    const { user, promote } = setup(COMPLETE);
    await user.click(promoteButton());
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("group", { name: "Confirmar promoción" })).not.toBeInTheDocument();
    expect(promoteButton()).toHaveFocus();
    expect(promote).not.toHaveBeenCalled();
  });

  it("Escape closes it with the same focus return", async () => {
    const { user } = setup(COMPLETE);
    await user.click(promoteButton());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "Confirmar promoción" })).not.toBeInTheDocument();
    expect(promoteButton()).toHaveFocus();
  });

  it("works with the keyboard alone: Tab to the button, Enter, Enter to confirm", async () => {
    const { user, promote } = setup(COMPLETE);
    promoteButton().focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(promote).toHaveBeenCalledTimes(1));
  });

  it("while sending, the buttons are disabled and a double click sends once", async () => {
    const d = deferred();
    const { user, promote } = setup(COMPLETE, jest.fn().mockReturnValue(d.promise));
    await user.click(promoteButton());
    const confirm = screen.getByRole("button", { name: "Confirmar promoción" });
    await user.dblClick(confirm);
    expect(promote).toHaveBeenCalledTimes(1);
    const sending = screen.getByRole("button", { name: "Promoviendo…" });
    expect(sending).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    d.resolve(RESULT);
    await screen.findByText(SUCCESS);
    expect(promote).toHaveBeenCalledTimes(1);
  });
});

describe("<PromotePanel> outcome", () => {
  it("success: focused status with the exact text, link to phase 2, onPromoted with the result", async () => {
    const { user, onPromoted } = setup(COMPLETE);
    await user.click(promoteButton());
    await user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    const notice = await screen.findByText(SUCCESS);
    expect(notice).toHaveAttribute("role", "status");
    expect(notice).toHaveFocus();
    expect(screen.getByRole("link", { name: "Ir a Briefing y concepto" })).toHaveAttribute("href", "/projects/PRY-2026-001/phase/2");
    expect(screen.queryByRole("button", { name: PROMOTE })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Confirmar promoción" })).not.toBeInTheDocument();
    expect(onPromoted).toHaveBeenCalledTimes(1);
    expect(onPromoted).toHaveBeenCalledWith(RESULT);
  });

  it("the success notice survives the parent handing in the frozen sheet", async () => {
    const { user, rerender } = setup(COMPLETE);
    await user.click(promoteButton());
    await user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    await screen.findByText(SUCCESS);
    rerender(<PromotePanel sheet={asSheet(API_SHEET_FROZEN)} promote={jest.fn()} />);
    expect(screen.getByText(SUCCESS)).toBeInTheDocument();
  });

  it.each([
    [403, "no_authority", "Solo un socio o un director puede promover la ficha."],
    [404, "project_not_found", "No existe el proyecto PRY-2026-001."],
  ])("%i %s: focused alert with the server text, confirmation stays, can retry", async (status, code, message) => {
    const promote = jest.fn().mockRejectedValueOnce(new ApiError(status, code, message)).mockResolvedValueOnce(RESULT);
    const { user, onPromoted } = setup(COMPLETE, promote);
    await user.click(promoteButton());
    await user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveFocus();
    expect(screen.queryByText(SUCCESS)).not.toBeInTheDocument();
    expect(onPromoted).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "Confirmar promoción" })).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Confirmar promoción" });
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await screen.findByText(SUCCESS);
    expect(promote).toHaveBeenCalledTimes(2);
  });

  it("success refreshes the router once, and the success notice keeps its focus", async () => {
    const { user } = setup(COMPLETE);
    await user.click(promoteButton());
    await user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    const notice = await screen.findByText(SUCCESS);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(notice).toHaveFocus();
  });

  it("an error does not refresh the router", async () => {
    const { user } = setup(COMPLETE, jest.fn().mockRejectedValue(new ApiError(403, "no_authority", "No.")));
    await user.click(promoteButton());
    await user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    await screen.findByRole("alert");
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("409 sheet_not_editable: focused stale notice, «Recargar» refreshes, and «Promover» is no longer offered", async () => {
    const promote = jest.fn().mockRejectedValue(new ApiError(409, "sheet_not_editable", "La ficha solo se promueve mientras el proyecto está en Inicio."));
    const { user, onPromoted } = setup(COMPLETE, promote);
    await user.click(promoteButton());
    await user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("El proyecto ya no está en Inicio: otra persona pudo haberlo promovido. Recarga la página.");
    expect(alert).toHaveFocus();
    expect(onPromoted).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: PROMOTE })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar promoción" })).not.toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Recargar" }));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(promote).toHaveBeenCalledTimes(1);
  });

  it("422 incomplete_deliverable: the alert carries the message and the missing labels", async () => {
    const error = new ApiError(422, "incomplete_deliverable", "Faltan 2 campos obligatorios.");
    Object.assign(error, { missing: ["Referencia catastral", "Alcance incluido"] });
    const { user } = setup(COMPLETE, jest.fn().mockRejectedValue(error));
    await user.click(promoteButton());
    await user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Faltan 2 campos obligatorios.");
    expect(alert).toHaveTextContent("Referencia catastral");
    expect(alert).toHaveTextContent("Alcance incluido");
    expect(alert).toHaveFocus();
  });

  it("an unexpected (non ApiError) failure shows the generic Spanish alert", async () => {
    const { user } = setup(COMPLETE, jest.fn().mockRejectedValue(new Error("boom")));
    await user.click(promoteButton());
    await user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ocurrió un error inesperado. Inténtalo de nuevo.");
  });
});

describe("<PromotePanel> accessibility", () => {
  it("no axe violations: incomplete, ready, confirming, error and success", async () => {
    const first = setup(INCOMPLETE);
    expect(await axe(first.container)).toHaveNoViolations();
    first.unmount();

    const ready = setup(COMPLETE, jest.fn().mockRejectedValue(new ApiError(403, "no_authority", "Sin autoridad.")));
    expect(await axe(ready.container)).toHaveNoViolations();
    await ready.user.click(promoteButton());
    expect(await axe(ready.container)).toHaveNoViolations();
    await ready.user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    await screen.findByRole("alert");
    expect(await axe(ready.container)).toHaveNoViolations();
    ready.unmount();

    const done = setup(COMPLETE);
    await done.user.click(promoteButton());
    await done.user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    await screen.findByText(SUCCESS);
    expect(await axe(done.container)).toHaveNoViolations();
  });
});
