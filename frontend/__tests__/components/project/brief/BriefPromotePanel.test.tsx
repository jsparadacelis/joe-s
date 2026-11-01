/**
 * RGB-32b contract of `@/components/project/brief/BriefPromotePanel` (to be created by the front developer):
 *   <BriefPromotePanel brief promote? onPromoted? />
 *     brief: Brief; promote?: () => Promise<PromoteBriefResult>  default: promoteBrief(brief.code)
 *     onPromoted?: (result: PromoteBriefResult) => void   called once on success (the parent swaps in result.brief)
 *   Renders <section aria-label="Promoción a Anteproyecto"> with a list (role list, aria-label «Requisitos») of 7
 *   requirements, in this order: Necesidades, Programa, Condicionantes, Presupuesto objetivo, Plazo,
 *   «Datos técnicos obtenidos», «Aprobación del cliente registrada». Each <li> has the label and, as text, «Cumplido»
 *   or «Falta» (the label sits in its own element inside the <li>). A brief field is «Falta» when its label is in completeness.missing; «Datos técnicos obtenidos» when
 *   !completeness.technical_data_obtained; «Aprobación del cliente registrada» when !client_approval_recorded.
 *   The idle panel has no role="status".
 *   Button «Promover a 3 · Anteproyecto»: enabled only if permissions.can_promote; otherwise disabled with a visible
 *   reason as its aria-describedby: requirements missing -> «Falta 1 requisito» / «Faltan N requisitos»; nothing missing
 *   but !can_promote -> «Solo el director de proyecto de este proyecto puede promover».
 *   Click -> role="group" «Confirmar promoción» with the text «Al promover a 3 · Anteproyecto, el brief quedará congelado
 *   como versión 1 y no se podrá editar.»; focus on «Confirmar promoción»; «Cancelar» and Escape close it and return focus
 *   to the promote button; nothing is sent before confirming. Sending: «Promoviendo…», buttons disabled, a double click
 *   sends once. Success -> role="status" tabIndex -1 focused «El brief v1 quedó congelado y el proyecto pasó a Anteproyecto»
 *   plus link «Ir a Anteproyecto» to /projects/{code}/phase/3; onPromoted(result) and router.refresh() once.
 *   ApiError -> role="alert" focused with the server message (+ the `missing` labels as list items, if any); the
 *   confirmation stays open and the button is usable again. 409 brief_not_editable -> the panel turns into an alert
 *   with the message plus «Recargar» (router.refresh()); no promote button.
 *   With brief.frozen_version !== null and no promotion made here, renders nothing.
 */
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { BriefPromotePanel } from "@/components/project/brief/BriefPromotePanel";
import { ApiError } from "@/lib/api";
import type { Brief, PromoteBriefResult } from "@/lib/brief";
import {
  API_BRIEF_COMPLETE,
  API_BRIEF_FROZEN,
  API_BRIEF_INCOMPLETE,
  API_BRIEF_NO_TECHNICAL_DATA,
  API_BRIEF_READ_ONLY,
  API_PROMOTE_RESULT,
  brief,
} from "../../../helpers/brief-fixtures";

beforeEach(() => mockRefresh.mockClear());

const asBrief = (b: unknown) => b as Brief;
const RESULT = API_PROMOTE_RESULT as unknown as PromoteBriefResult;
const PROMOTE = "Promover a 3 · Anteproyecto";
const SUCCESS = "El brief v1 quedó congelado y el proyecto pasó a Anteproyecto";

function setup(source: unknown = API_BRIEF_COMPLETE, promote: jest.Mock = jest.fn().mockResolvedValue(RESULT), onPromoted = jest.fn()) {
  const user = userEvent.setup();
  const view = render(<BriefPromotePanel brief={asBrief(source)} promote={promote} onPromoted={onPromoted} />);
  return { user, promote, onPromoted, ...view };
}
const promoteButton = () => screen.getByRole("button", { name: PROMOTE });
const requirement = (name: string) =>
  within(screen.getByRole("list", { name: "Requisitos" })).getByText(name, { exact: false }).closest("li") as HTMLElement;
const deferred = () => {
  let resolve!: (v: PromoteBriefResult) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<PromoteBriefResult>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};
const failing = (status: number, code: string, message: string, missing?: string[]) =>
  jest.fn().mockRejectedValue(new ApiError(status, code, message, undefined, missing));

describe("<BriefPromotePanel> completeness", () => {
  it("lists the seven requirements in order", () => {
    setup();
    const items = within(screen.getByRole("list", { name: "Requisitos" })).getAllByRole("listitem");
    expect(items).toHaveLength(7);
    const labels = ["Necesidades", "Programa", "Condicionantes", "Presupuesto objetivo", "Plazo", "Datos técnicos obtenidos", "Aprobación del cliente registrada"];
    labels.forEach((label, i) => expect(items[i]).toHaveTextContent(label));
  });

  it("a complete brief has every requirement «Cumplido»", () => {
    setup();
    const items = within(screen.getByRole("list", { name: "Requisitos" })).getAllByRole("listitem");
    for (const item of items) {
      expect(item).toHaveTextContent("Cumplido");
      expect(item).not.toHaveTextContent("Falta");
    }
  });

  it("marks the missing required fields and the approval as «Falta», and the rest as «Cumplido»", () => {
    setup(API_BRIEF_INCOMPLETE);
    expect(requirement("Programa")).toHaveTextContent("Falta");
    expect(requirement("Condicionantes")).toHaveTextContent("Falta");
    expect(requirement("Presupuesto objetivo")).toHaveTextContent("Falta");
    expect(requirement("Aprobación del cliente registrada")).toHaveTextContent("Falta");
    expect(requirement("Necesidades")).toHaveTextContent("Cumplido");
    expect(requirement("Plazo")).toHaveTextContent("Cumplido");
    expect(requirement("Datos técnicos obtenidos")).toHaveTextContent("Cumplido");
  });

  it("marks «Datos técnicos obtenidos» as «Falta» when there are none", () => {
    setup(API_BRIEF_NO_TECHNICAL_DATA);
    expect(requirement("Datos técnicos obtenidos")).toHaveTextContent("Falta");
    expect(requirement("Aprobación del cliente registrada")).toHaveTextContent("Falta");
    expect(requirement("Necesidades")).toHaveTextContent("Cumplido");
  });

  it("the idle panel has no status", () => {
    setup();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("<BriefPromotePanel> button", () => {
  it("is enabled when the server says can_promote, with no reason", () => {
    setup();
    expect(promoteButton()).toBeEnabled();
    expect(promoteButton()).not.toHaveAttribute("aria-describedby");
  });

  it("plural reason when several requirements are missing", () => {
    setup(API_BRIEF_INCOMPLETE);
    expect(promoteButton()).toBeDisabled();
    expect(promoteButton()).toHaveAccessibleDescription("Faltan 4 requisitos");
  });

  it("singular reason when one is missing", () => {
    setup(brief({ completeness: { client_approval_recorded: false, complete: false }, permissions: { can_promote: false } }));
    expect(promoteButton()).toBeDisabled();
    expect(promoteButton()).toHaveAccessibleDescription("Falta 1 requisito");
  });

  it("counts technical data and approval with the missing fields", () => {
    setup(API_BRIEF_NO_TECHNICAL_DATA);
    expect(promoteButton()).toHaveAccessibleDescription("Faltan 2 requisitos");
  });

  it("complete but the server says no authority: the reason names the role", () => {
    setup(API_BRIEF_READ_ONLY);
    expect(promoteButton()).toBeDisabled();
    expect(promoteButton()).toHaveAccessibleDescription("Solo el director de proyecto de este proyecto puede promover");
  });

  it("a disabled button sends nothing", async () => {
    const { user, promote } = setup(API_BRIEF_INCOMPLETE);
    await user.click(promoteButton());
    expect(promote).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "Confirmar promoción" })).not.toBeInTheDocument();
  });

  it("the front does not decide permissions: can_promote true wins over the checklist", () => {
    setup(brief({ completeness: { missing: ["Programa"], complete: false }, permissions: { can_promote: true } }));
    expect(promoteButton()).toBeEnabled();
  });
});

describe("<BriefPromotePanel> confirmation", () => {
  it("click opens the confirmation with focus on «Confirmar promoción», sending nothing", async () => {
    const { user, promote } = setup();
    await user.click(promoteButton());
    const group = screen.getByRole("group", { name: "Confirmar promoción" });
    expect(group).toHaveTextContent("Al promover a 3 · Anteproyecto, el brief quedará congelado como versión 1 y no se podrá editar.");
    await waitFor(() => expect(within(group).getByRole("button", { name: "Confirmar promoción" })).toHaveFocus());
    expect(promote).not.toHaveBeenCalled();
  });

  it("Cancelar closes it and returns focus to the promote button", async () => {
    const { user, promote } = setup();
    await user.click(promoteButton());
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("group", { name: "Confirmar promoción" })).not.toBeInTheDocument();
    await waitFor(() => expect(promoteButton()).toHaveFocus());
    expect(promote).not.toHaveBeenCalled();
  });

  it("Escape closes it and returns focus to the promote button", async () => {
    const { user } = setup();
    await user.click(promoteButton());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "Confirmar promoción" })).not.toBeInTheDocument();
    await waitFor(() => expect(promoteButton()).toHaveFocus());
  });
});

describe("<BriefPromotePanel> promoting", () => {
  it("confirming sends once, shows the success focused with a link to phase 3 and notifies the parent", async () => {
    const { user, promote, onPromoted } = setup();
    await user.click(promoteButton());
    await user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(SUCCESS);
    await waitFor(() => expect(status).toHaveFocus());
    expect(screen.getByRole("link", { name: "Ir a Anteproyecto" })).toHaveAttribute("href", "/projects/PRY-2026-001/phase/3");
    expect(promote).toHaveBeenCalledTimes(1);
    expect(onPromoted).toHaveBeenCalledTimes(1);
    expect(onPromoted).toHaveBeenCalledWith(RESULT);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: PROMOTE })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Confirmar promoción" })).not.toBeInTheDocument();
  });

  it("encodes the project code in the link", async () => {
    const result = { ...API_PROMOTE_RESULT, code: "A/B C" };
    const { user } = setup(brief({ code: "A/B C" }), jest.fn().mockResolvedValue(result));
    await user.click(promoteButton());
    await user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    expect(await screen.findByRole("link", { name: "Ir a Anteproyecto" })).toHaveAttribute("href", "/projects/A%2FB%20C/phase/3");
  });

  it("while sending: «Promoviendo…», disabled buttons and a double click sends once", async () => {
    const pending = deferred();
    const { user, promote } = setup(API_BRIEF_COMPLETE, jest.fn().mockReturnValue(pending.promise));
    await user.click(promoteButton());
    await user.dblClick(screen.getByRole("button", { name: "Confirmar promoción" }));
    expect(promote).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Promoviendo…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(promoteButton()).toBeDisabled();
    pending.resolve(RESULT);
    expect(await screen.findByRole("status")).toHaveTextContent(SUCCESS);
    expect(promote).toHaveBeenCalledTimes(1);
  });

  it("Escape while sending does not close the confirmation", async () => {
    const pending = deferred();
    const { user } = setup(API_BRIEF_COMPLETE, jest.fn().mockReturnValue(pending.promise));
    await user.click(promoteButton());
    await user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("group", { name: "Confirmar promoción" })).toBeInTheDocument();
    pending.resolve(RESULT);
    await screen.findByRole("status");
  });
});

describe("<BriefPromotePanel> errors", () => {
  async function confirmWith(promote: jest.Mock, source: unknown = API_BRIEF_COMPLETE) {
    const view = setup(source, promote);
    await view.user.click(promoteButton());
    await view.user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    return view;
  }

  it("403: focused alert with the server message, confirmation stays, usable again", async () => {
    const message = "Solo el director de proyecto de este proyecto puede promover el brief.";
    const { promote, user } = await confirmWith(failing(403, "no_authority", message));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByRole("group", { name: "Confirmar promoción" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar promoción" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    expect(promote).toHaveBeenCalledTimes(2);
  });

  it("404: focused alert with the message", async () => {
    await confirmWith(failing(404, "project_not_found", "No existe el proyecto PRY-2026-001."));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No existe el proyecto PRY-2026-001.");
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it("422 incomplete_deliverable: the message and every missing label", async () => {
    const missing = ["Programa", "Datos técnicos obtenidos", "Aprobación del cliente registrada"];
    await confirmWith(failing(422, "incomplete_deliverable", "El brief no está listo para promover: faltan 3 requisitos.", missing));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("El brief no está listo para promover: faltan 3 requisitos.");
    const items = within(alert).getAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual(missing);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByRole("group", { name: "Confirmar promoción" })).toBeInTheDocument();
  });

  it("409 brief_not_editable: only the alert and «Recargar» remain", async () => {
    const message = "El brief solo se puede editar o promover mientras el proyecto está en la fase 2.";
    const { user } = await confirmWith(failing(409, "brief_not_editable", message));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.queryByRole("button", { name: PROMOTE })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Confirmar promoción" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Recargar" }));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("a non-ApiError failure shows the generic Spanish message", async () => {
    await confirmWith(jest.fn().mockRejectedValue(new Error("boom")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ocurrió un error inesperado. Inténtalo de nuevo.");
  });

  it("an error does not call onPromoted nor refresh", async () => {
    const { onPromoted } = await confirmWith(failing(403, "no_authority", "No."));
    await screen.findByRole("alert");
    expect(onPromoted).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe("<BriefPromotePanel> frozen", () => {
  it("renders nothing for a frozen brief", () => {
    const { container } = setup(API_BRIEF_FROZEN);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("<BriefPromotePanel> accessibility", () => {
  it("no violations idle, disabled, confirming, with an error and after success", async () => {
    const first = setup();
    expect(await axe(first.container)).toHaveNoViolations();
    await first.user.click(promoteButton());
    expect(await axe(first.container)).toHaveNoViolations();
    first.unmount();
    const second = setup(API_BRIEF_INCOMPLETE);
    expect(await axe(second.container)).toHaveNoViolations();
    second.unmount();
    const third = setup(API_BRIEF_COMPLETE, failing(422, "incomplete_deliverable", "No listo.", ["Programa"]));
    await third.user.click(promoteButton());
    await third.user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    await screen.findByRole("alert");
    expect(await axe(third.container)).toHaveNoViolations();
    third.unmount();
    const fourth = setup();
    await fourth.user.click(promoteButton());
    await fourth.user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    await screen.findByRole("status");
    expect(await axe(fourth.container)).toHaveNoViolations();
  });
});
