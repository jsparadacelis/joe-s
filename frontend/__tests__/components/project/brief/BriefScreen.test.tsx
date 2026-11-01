/**
 * RGB-32b contract of `@/components/project/brief/BriefScreen` (container, to be created; the analogue of ProjectSheet):
 *   <BriefScreen brief save? promote? />
 *     brief: Brief; save?: (update) => Promise<Brief>; promote?: () => Promise<PromoteBriefResult>
 *   Renders <Panel title="Brief"> (h2 «Brief»). It holds the brief in state (a new `brief` prop replaces it) and composes:
 *     - when frozen_version !== null: the notice «Brief v{N} congelado · solo lectura» (also after promoting here);
 *     - <BriefPromotePanel> while the brief is not frozen (and the success message after promoting here, then it stays);
 *     - <BriefForm> (editable only with permissions.can_edit); onSaved replaces the held brief, so the promote panel
 *       follows the server's recalculated completeness and permissions after each save;
 *     - <TechnicalDataSnapshot> only when frozen (in phase 2 the live technical data are the editor above).
 *   After a successful promotion the frozen brief from the result replaces the state: form read-only, snapshot visible.
 */
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { BriefScreen } from "@/components/project/brief/BriefScreen";
import type { Brief, PromoteBriefResult } from "@/lib/brief";
import {
  API_BRIEF_COMPLETE,
  API_BRIEF_FROZEN,
  API_BRIEF_INCOMPLETE,
  API_BRIEF_READ_ONLY,
  API_PROMOTE_RESULT,
  brief,
} from "../../../helpers/brief-fixtures";

beforeEach(() => mockRefresh.mockClear());

const asBrief = (b: unknown) => b as Brief;
const RESULT = API_PROMOTE_RESULT as unknown as PromoteBriefResult;
const PROMOTE = "Promover a 3 · Anteproyecto";
const FROZEN_NOTICE = "Brief v1 congelado · solo lectura";

function setup(source: unknown, props: { save?: jest.Mock; promote?: jest.Mock } = {}) {
  const user = userEvent.setup();
  const view = render(<BriefScreen brief={asBrief(source)} save={props.save} promote={props.promote ?? jest.fn().mockResolvedValue(RESULT)} />);
  return { user, ...view };
}

describe("<BriefScreen> phase 2, the project director", () => {
  it("has the Brief heading, the promote panel and the editable form, without the frozen notice or the snapshot", () => {
    setup(API_BRIEF_COMPLETE);
    expect(screen.getByRole("heading", { level: 2, name: "Brief" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Promoción a Anteproyecto" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Brief" })).toBeInTheDocument();
    expect(screen.queryByText(FROZEN_NOTICE)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Datos técnicos congelados" })).not.toBeInTheDocument();
  });

  it("saving recalculates the promote panel with the completeness the server returned", async () => {
    const saved = brief({
      fields: { program: "Programa nuevo" },
      completeness: { missing: [], client_approval_recorded: true, complete: true },
      permissions: { can_promote: true },
    });
    const { user } = setup(API_BRIEF_INCOMPLETE, { save: jest.fn().mockResolvedValue(saved) });
    expect(screen.getByRole("button", { name: PROMOTE })).toBeDisabled();
    await user.type(screen.getByLabelText("Programa"), "Programa nuevo");
    await user.click(screen.getByRole("button", { name: "Guardar brief" }));
    await screen.findByText("Brief guardado");
    expect(screen.getByRole("button", { name: PROMOTE })).toBeEnabled();
  });

  it("promoting freezes it: notice, success message, read-only form and the snapshot", async () => {
    const { user } = setup(API_BRIEF_COMPLETE);
    await user.click(screen.getByRole("button", { name: PROMOTE }));
    await user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    expect(await screen.findByText("El brief v1 quedó congelado y el proyecto pasó a Anteproyecto")).toBeInTheDocument();
    expect(screen.getByText(FROZEN_NOTICE)).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Brief" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar brief" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Datos técnicos congelados" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a Anteproyecto" })).toBeInTheDocument();
  });
});

describe("<BriefScreen> without authority", () => {
  it("read-only values, the disabled promote button with its reason and no form", () => {
    setup(API_BRIEF_READ_ONLY);
    expect(screen.queryByRole("form", { name: "Brief" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar brief" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: PROMOTE })).toBeDisabled();
    expect(screen.getByText("Solo el director de proyecto de este proyecto puede promover")).toBeInTheDocument();
    expect(screen.getByText("Vivienda unifamiliar para una familia de cuatro personas")).toBeInTheDocument();
  });
});

describe("<BriefScreen> frozen (phase > 2)", () => {
  it("shows the notice, the read-only brief and the frozen technical data, with no promote panel or form", () => {
    setup(API_BRIEF_FROZEN);
    expect(screen.getByText(FROZEN_NOTICE)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Promoción a Anteproyecto" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Promover/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Brief" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar brief" })).not.toBeInTheDocument();
    expect(screen.getByText("Vivienda unifamiliar para una familia de cuatro personas")).toBeInTheDocument();
    const snapshot = screen.getByRole("region", { name: "Datos técnicos congelados" });
    expect(within(snapshot).getByText("Año de construcción")).toBeInTheDocument();
    expect(within(snapshot).getByText(/sin verificar/i)).toBeInTheDocument();
  });

  it("nothing in the frozen screen is editable", () => {
    setup(API_BRIEF_FROZEN);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("a new brief prop replaces the held one", async () => {
    const view = setup(API_BRIEF_COMPLETE);
    view.rerender(<BriefScreen brief={asBrief(API_BRIEF_FROZEN)} />);
    await waitFor(() => expect(screen.getByText(FROZEN_NOTICE)).toBeInTheDocument());
  });
});

describe("<BriefScreen> accessibility", () => {
  it("no violations editable, read-only, frozen and after promoting", async () => {
    const editable = setup(API_BRIEF_COMPLETE);
    expect(await axe(editable.container)).toHaveNoViolations();
    await editable.user.click(screen.getByRole("button", { name: PROMOTE }));
    await editable.user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    await screen.findByText(FROZEN_NOTICE);
    expect(await axe(editable.container)).toHaveNoViolations();
    editable.unmount();
    const readOnly = setup(API_BRIEF_READ_ONLY);
    expect(await axe(readOnly.container)).toHaveNoViolations();
    readOnly.unmount();
    const frozen = setup(API_BRIEF_FROZEN);
    expect(await axe(frozen.container)).toHaveNoViolations();
  });
});
