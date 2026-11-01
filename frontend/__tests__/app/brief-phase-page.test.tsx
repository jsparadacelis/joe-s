/**
 * RGB-32b integration of `<BriefScreen>` in `app/projects/[code]/phase/[phase]/page.tsx`:
 * the brief is loaded on the server (`GET /api/projects/{code}/brief`) and rendered under the technical data when the
 * VIEWED phase is 2 and the project is a real one (not a PRY-EJ sample). The page passes the brief as the API sent it
 * (current phase 2: live draft; current phase > 2: frozen v1). A 404 `brief_not_found` shows «Todavía no hay brief para
 * este proyecto.» (Notice); another failure shows «No se pudo cargar el brief.» plus the reason (role="alert");
 * the rest of the page stays in both cases.
 */
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import PhasePage from "@/app/projects/[code]/phase/[phase]/page";
import { API_BRIEF_COMPLETE, API_BRIEF_FROZEN, API_BRIEF_INCOMPLETE, API_BRIEF_READ_ONLY } from "../helpers/brief-fixtures";
import { apiSheetJson, reply } from "../helpers/technical-data-fake-api";

jest.mock("next/navigation", () => ({
  usePathname: () => "/projects/PRY-2026-001/phase/2",
  useRouter: () => ({ refresh: jest.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const page = (code: string, phase: string) => PhasePage({ params: Promise.resolve({ code, phase }) });

function stubApi({ currentPhase = 2, briefReply = reply(200, API_BRIEF_COMPLETE) }: { currentPhase?: number; briefReply?: ReturnType<typeof reply> } = {}) {
  const calls: { url: string; method: string }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, method: init?.method ?? "GET" });
    if (u.endsWith("/brief")) return briefReply;
    if (u.endsWith("/technical-data")) return reply(200, apiSheetJson({ address: { value: "CL REAL 1", original: "CL REAL 1" } }));
    return reply(200, { code: "PRY-2026-001", name: "Test house", current_phase: currentPhase, project_type: "single_family_house" });
  }) as unknown as typeof fetch;
  return { calls, briefCalls: () => calls.filter((c) => c.url.includes("/brief")), restore: () => (globalThis.fetch = original) };
}

let restore: () => void = () => undefined;
afterEach(() => restore());

describe("brief in the phase 2 page (RGB-32b)", () => {
  it("phase 2 of a real project: asks the brief once with GET and shows it under the technical data", async () => {
    const stub = stubApi();
    restore = stub.restore;
    render(await page("PRY-2026-001", "2"));
    expect(stub.briefCalls()).toEqual([{ url: expect.stringMatching(/\/api\/projects\/PRY-2026-001\/brief$/), method: "GET" }]);
    const heading = screen.getByRole("heading", { level: 2, name: "Brief" });
    expect(heading).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Brief" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Promoción a Anteproyecto" })).toBeInTheDocument();
    // under the technical data: the technical data panel comes first in the document
    const technical = await screen.findByDisplayValue("CL REAL 1");
    expect(technical.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the server's permissions decide: can_edit false shows the values read-only", async () => {
    const stub = stubApi({ briefReply: reply(200, API_BRIEF_READ_ONLY) });
    restore = stub.restore;
    render(await page("PRY-2026-001", "2"));
    expect(screen.queryByRole("form", { name: "Brief" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar brief" })).not.toBeInTheDocument();
    expect(screen.getByText("Vivienda unifamiliar para una familia de cuatro personas")).toBeInTheDocument();
  });

  it("an incomplete brief: the promote button is disabled with its reason", async () => {
    const stub = stubApi({ briefReply: reply(200, API_BRIEF_INCOMPLETE) });
    restore = stub.restore;
    render(await page("PRY-2026-001", "2"));
    expect(screen.getByRole("button", { name: "Promover a 3 · Anteproyecto" })).toBeDisabled();
    expect(screen.getByText("Faltan 4 requisitos")).toBeInTheDocument();
  });

  it.each([3, 4, 7])("current phase %s: shows the frozen v1 with the notice and the technical data snapshot, read-only", async (current) => {
    const stub = stubApi({ currentPhase: current, briefReply: reply(200, API_BRIEF_FROZEN) });
    restore = stub.restore;
    render(await page("PRY-2026-001", "2"));
    expect(screen.getByRole("heading", { level: 2, name: "Brief" })).toBeInTheDocument();
    expect(screen.getByText("Brief v1 congelado · solo lectura")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Datos técnicos congelados" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar brief" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Promover/ })).not.toBeInTheDocument();
  });

  it.each(["0", "1", "3", "4"])("phase %s of a real project: no brief and no call to /brief", async (viewed) => {
    const stub = stubApi({ currentPhase: 4 });
    restore = stub.restore;
    render(await page("PRY-2026-001", viewed));
    expect(screen.queryByRole("heading", { name: "Brief" })).not.toBeInTheDocument();
    expect(stub.briefCalls()).toEqual([]);
  });

  it("phase 2 of a sample project (PRY-EJ-*): no brief and never calls the brief API", async () => {
    const stub = stubApi();
    restore = stub.restore;
    render(await page("PRY-EJ-001", "2"));
    expect(screen.queryByRole("heading", { name: "Brief" })).not.toBeInTheDocument();
    expect(stub.calls).toEqual([]);
  });

  it("404 brief_not_found: a clear message, no brief, the page still renders", async () => {
    const stub = stubApi({
      currentPhase: 1,
      briefReply: reply(404, { detail: { code: "brief_not_found", message: "El proyecto aún no tiene brief." } }),
    });
    restore = stub.restore;
    render(await page("PRY-2026-001", "2"));
    expect(screen.getByText("Todavía no hay brief para este proyecto.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Brief" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Test house" })).toBeInTheDocument();
  });

  it("an API failure shows «No se pudo cargar el brief.» plus the reason, and the page stays", async () => {
    const stub = stubApi({ briefReply: reply(500, { detail: { code: "boom", message: "El servidor falló." } }) });
    restore = stub.restore;
    render(await page("PRY-2026-001", "2"));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No se pudo cargar el brief.");
    expect(alert).toHaveTextContent("El servidor falló.");
    expect(screen.getByRole("heading", { level: 1, name: "Test house" })).toBeInTheDocument();
  });

  it("a response that is not a brief is reported like any other failure", async () => {
    const stub = stubApi({ briefReply: reply(200, { hello: "world" }) });
    restore = stub.restore;
    render(await page("PRY-2026-001", "2"));
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el brief.");
    expect(screen.getByRole("alert")).toHaveTextContent("La respuesta del brief no es válida. Inténtalo de nuevo.");
  });

  it("no accessibility violations: editable, frozen and the empty state", async () => {
    const stub = stubApi();
    restore = stub.restore;
    const first = render(<main>{await page("PRY-2026-001", "2")}</main>);
    expect(await screen.findByDisplayValue("CL REAL 1")).toBeInTheDocument();
    expect(await axe(first.container)).toHaveNoViolations();
    first.unmount();
    stub.restore();
    const frozen = stubApi({ currentPhase: 3, briefReply: reply(200, API_BRIEF_FROZEN) });
    restore = frozen.restore;
    const second = render(<main>{await page("PRY-2026-001", "2")}</main>);
    expect(await screen.findByDisplayValue("CL REAL 1")).toBeInTheDocument();
    expect(await axe(second.container)).toHaveNoViolations();
    second.unmount();
    frozen.restore();
    const empty = stubApi({ briefReply: reply(404, { detail: { code: "brief_not_found", message: "Sin brief." } }) });
    restore = empty.restore;
    const third = render(<main>{await page("PRY-2026-001", "2")}</main>);
    expect(screen.getByText("Todavía no hay brief para este proyecto.")).toBeInTheDocument();
    expect(await axe(third.container)).toHaveNoViolations();
  });
});
