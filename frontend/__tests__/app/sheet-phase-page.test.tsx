/**
 * RGB-17a integration of `<ProjectSheet>` in `app/projects/[code]/phase/[phase]/page.tsx`:
 * the sheet is mounted when the VIEWED phase is 1 and the project is a real one (not a PRY-EJ sample);
 * `GET /api/projects/{code}/sheet` is asked only then. A 404 `sheet_not_found` shows the message
 * «Todavía no hay ficha para este proyecto.» and the rest of the page stays.
 */
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import PhasePage from "@/app/projects/[code]/phase/[phase]/page";
import { API_SHEET } from "../helpers/sheet-fixtures";

jest.mock("next/navigation", () => ({
  usePathname: () => "/projects/PRY-2026-001/phase/1",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const reply = (status: number, body: unknown) => ({ ok: status < 300, status, text: async () => JSON.stringify(body) });
const page = (code: string, phase: string) => PhasePage({ params: Promise.resolve({ code, phase }) });

function stubApi({ currentPhase = 1, sheetReply = reply(200, API_SHEET) }: { currentPhase?: number; sheetReply?: ReturnType<typeof reply> } = {}) {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    calls.push(u);
    if (u.endsWith("/sheet")) return sheetReply;
    return reply(200, { code: "PRY-2026-001", name: "Test house", current_phase: currentPhase, project_type: "single_family_house" });
  }) as unknown as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

let restore: () => void = () => undefined;
afterEach(() => restore());

describe("project sheet in the phase page (RGB-17a)", () => {
  it("phase 1 of a real project: asks the sheet and shows it", async () => {
    const stub = stubApi();
    restore = stub.restore;
    render(await page("PRY-2026-001", "1"));
    expect(stub.calls.some((c) => c.endsWith("/api/projects/PRY-2026-001/sheet"))).toBe(true);
    expect(screen.getByRole("heading", { level: 2, name: "Ficha del proyecto" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Identificación" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("35 %");
  });

  it("a later current phase still shows the sheet when phase 1 is viewed", async () => {
    const stub = stubApi({ currentPhase: 3 });
    restore = stub.restore;
    render(await page("PRY-2026-001", "1"));
    expect(screen.getByRole("heading", { level: 2, name: "Ficha del proyecto" })).toBeInTheDocument();
  });

  it.each(["0", "4"])("phase %s of a real project: no sheet and no call to /sheet", async (viewed) => {
    const stub = stubApi({ currentPhase: 4 });
    restore = stub.restore;
    render(await page("PRY-2026-001", viewed));
    expect(screen.queryByRole("heading", { name: "Ficha del proyecto" })).not.toBeInTheDocument();
    expect(stub.calls.some((c) => c.endsWith("/sheet"))).toBe(false);
  });

  it("phase 1 of a sample project (PRY-EJ-*): keeps its current view and never calls the API", async () => {
    const stub = stubApi();
    restore = stub.restore;
    render(await page("PRY-EJ-001", "1"));
    expect(screen.queryByRole("heading", { name: "Ficha del proyecto" })).not.toBeInTheDocument();
    expect(stub.calls).toEqual([]);
  });

  it("404 sheet_not_found: clear message, no sheet, the page still renders", async () => {
    const stub = stubApi({
      currentPhase: 0,
      sheetReply: reply(404, { detail: { code: "sheet_not_found", message: "El proyecto aún no tiene ficha." } }),
    });
    restore = stub.restore;
    render(await page("PRY-2026-001", "1"));
    expect(screen.getByText("Todavía no hay ficha para este proyecto.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ficha del proyecto" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Test house" })).toBeInTheDocument();
  });

  it("an API failure shows «No se pudo cargar la ficha del proyecto.» plus the reason, and the page stays", async () => {
    const stub = stubApi({ sheetReply: reply(500, { detail: { code: "boom", message: "El servidor falló." } }) });
    restore = stub.restore;
    render(await page("PRY-2026-001", "1"));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No se pudo cargar la ficha del proyecto.");
    expect(alert).toHaveTextContent("El servidor falló.");
    expect(screen.getByRole("heading", { level: 1, name: "Test house" })).toBeInTheDocument();
  });

  it("no accessibility violations with the sheet and with the empty state", async () => {
    const stub = stubApi();
    restore = stub.restore;
    const first = render(<main>{await page("PRY-2026-001", "1")}</main>);
    expect(screen.getByRole("heading", { name: "Ficha del proyecto" })).toBeInTheDocument();
    expect(await axe(first.container)).toHaveNoViolations();
    first.unmount();
    stub.restore();
    const missing = stubApi({ sheetReply: reply(404, { detail: { code: "sheet_not_found", message: "Sin ficha." } }) });
    restore = missing.restore;
    const second = render(<main>{await page("PRY-2026-001", "1")}</main>);
    expect(screen.getByText("Todavía no hay ficha para este proyecto.")).toBeInTheDocument();
    expect(await axe(second.container)).toHaveNoViolations();
  });
});

describe("sheet editability in the phase page (RGB-17b)", () => {
  it("viewed phase 1 = current phase 1: blocks have «Editar» buttons", async () => {
    const stub = stubApi({ currentPhase: 1 });
    restore = stub.restore;
    render(await page("PRY-2026-001", "1"));
    expect(screen.getAllByRole("button", { name: /^Editar/ })).toHaveLength(7);
  });

  it.each([0, 2, 3, 7])("viewed phase 1 while the current phase is %s: read-only, no «Editar»", async (current) => {
    const stub = stubApi({ currentPhase: current });
    restore = stub.restore;
    render(await page("PRY-2026-001", "1"));
    expect(screen.getByRole("heading", { level: 2, name: "Ficha del proyecto" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
  });

  it("no accessibility violations in the editable page", async () => {
    const stub = stubApi({ currentPhase: 1 });
    restore = stub.restore;
    const view = render(<main>{await page("PRY-2026-001", "1")}</main>);
    expect(await axe(view.container)).toHaveNoViolations();
  });
});
