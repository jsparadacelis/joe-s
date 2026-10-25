/**
 * RGB-19 contract of `@/components/project/sheet/ProjectSheet` (extended):
 *   <ProjectSheet sheet save? loadPlan? promote? />    (the `editable` prop is removed)
 *   - «Editar» buttons depend on `sheet.permissions.can_edit`, not on the phase.
 *   - Not frozen: renders <PromotePanel sheet promote> after the summary (the summary stays the first role="status").
 *   - `sheet.frozen_version` !== null: the notice «Ficha v1 congelada · solo lectura» (text `Ficha v{n} congelada · solo lectura`),
 *     no «Editar», no «Promover…» button, description «Solo lectura…».
 *   - On a successful promotion it takes `result.sheet` as its state: read-only with the frozen notice, and the PromotePanel
 *     success notice (with its focus and link) stays.
 */
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { ProjectSheet } from "@/components/project/sheet/ProjectSheet";
import type { ProjectSheet as ProjectSheetModel } from "@/lib/sheet";
import { API_SHEET, API_SHEET_COMPLETE, API_SHEET_EDITABLE, API_SHEET_FROZEN } from "../../../helpers/sheet-fixtures";

const asSheet = (s: unknown) => s as ProjectSheetModel;
const FROZEN_NOTICE = "Ficha v1 congelada · solo lectura";
const PROMOTE = "Promover a 2 · Briefing y concepto";

describe("<ProjectSheet> permissions (RGB-19)", () => {
  it("can_edit true shows «Editar»; can_edit false hides it, whatever the sheet phase says", () => {
    const { rerender } = render(<ProjectSheet sheet={asSheet({ ...API_SHEET_EDITABLE, phase: 3 })} />);
    expect(screen.getAllByRole("button", { name: /^Editar/ })).toHaveLength(7);
    rerender(<ProjectSheet sheet={asSheet({ ...API_SHEET, phase: 1 })} />);
    expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
  });

  it("not frozen: the promote panel is present (disabled when it cannot promote) and the summary is the first status", () => {
    render(<ProjectSheet sheet={asSheet(API_SHEET_EDITABLE)} />);
    expect(screen.getByRole("region", { name: "Promoción a Briefing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: PROMOTE })).toBeDisabled();
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("35 %");
    expect(screen.queryByText(FROZEN_NOTICE)).not.toBeInTheDocument();
  });

  it("frozen v1: notice, no «Editar», no «Promover», read-only description", () => {
    render(<ProjectSheet sheet={asSheet(API_SHEET_FROZEN)} />);
    expect(screen.getByText(FROZEN_NOTICE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Promover/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Promoción a Briefing" })).not.toBeInTheDocument();
    expect(screen.getByText(/Solo lectura/)).toBeInTheDocument();
  });

  it("frozen even if the permissions were (wrongly) true: no «Editar» and no «Promover»", () => {
    render(<ProjectSheet sheet={asSheet({ ...API_SHEET_COMPLETE, frozen_version: 1 })} />);
    expect(screen.queryByRole("button", { name: /Editar|Promover/ })).not.toBeInTheDocument();
  });

  it("promoting swaps in the frozen sheet: read-only, frozen notice, success notice and link kept", async () => {
    const promote = jest.fn().mockResolvedValue({
      code: "PRY-2026-001", action: "promote", previous_phase: 1, current_phase: 2, frozen_version: 1, sheet: asSheet(API_SHEET_FROZEN),
    });
    const user = userEvent.setup();
    render(<ProjectSheet sheet={asSheet(API_SHEET_COMPLETE)} promote={promote} />);
    expect(screen.getAllByRole("button", { name: /^Editar/ })).toHaveLength(7);
    await user.click(screen.getByRole("button", { name: PROMOTE }));
    await user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    const notice = await screen.findByText("La ficha v1 quedó congelada y el proyecto pasó a Briefing y concepto");
    expect(notice).toHaveFocus();
    expect(screen.getByRole("link", { name: "Ir a Briefing y concepto" })).toHaveAttribute("href", "/projects/PRY-2026-001/phase/2");
    expect(screen.getByText(FROZEN_NOTICE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: PROMOTE })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Gobierno" })).getByText("Completo")).toBeInTheDocument();
  });

  it("promoting refreshes the router once and the page handing in a new frozen sheet keeps the success notice focused", async () => {
    mockRefresh.mockClear();
    const promote = jest.fn().mockResolvedValue({
      code: "PRY-2026-001", action: "promote", previous_phase: 1, current_phase: 2, frozen_version: 1, sheet: asSheet(API_SHEET_FROZEN),
    });
    const user = userEvent.setup();
    const { rerender } = render(<ProjectSheet sheet={asSheet(API_SHEET_COMPLETE)} promote={promote} />);
    await user.click(screen.getByRole("button", { name: PROMOTE }));
    await user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    const notice = await screen.findByText("La ficha v1 quedó congelada y el proyecto pasó a Briefing y concepto");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    rerender(<ProjectSheet sheet={asSheet({ ...API_SHEET_FROZEN })} promote={promote} />);
    expect(screen.getByText("La ficha v1 quedó congelada y el proyecto pasó a Briefing y concepto")).toBe(notice);
    expect(notice).toHaveFocus();
    expect(screen.getByText(FROZEN_NOTICE)).toBeInTheDocument();
  });

  it("no axe violations: ready to promote and frozen", async () => {
    const ready = render(<ProjectSheet sheet={asSheet(API_SHEET_COMPLETE)} />);
    expect(await axe(ready.container)).toHaveNoViolations();
    ready.unmount();
    const frozen = render(<ProjectSheet sheet={asSheet(API_SHEET_FROZEN)} />);
    expect(await axe(frozen.container)).toHaveNoViolations();
  });
});
