/**
 * RGB-51 · the phase 2 page passes `projectCode` to the editor. A real project is loaded by the editor in the browser
 * (`GET /api/projects/{code}/technical-data`); a PRY-EJ sample keeps its fictitious data and never asks the API.
 */
import { render, screen } from "@testing-library/react";
import PhasePage from "@/app/projects/[code]/phase/[phase]/page";
import { apiSheetJson, reply } from "../helpers/technical-data-fake-api";

jest.mock("next/navigation", () => ({
  usePathname: () => "/projects/PRY-2026-001/phase/2",
  useRouter: () => ({ refresh: jest.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const page = (code: string, phase: string) => PhasePage({ params: Promise.resolve({ code, phase }) });

function stubApi(currentPhase: number) {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    calls.push(u);
    if (u.endsWith("/technical-data")) return reply(200, apiSheetJson({ address: { value: "CL REAL 1", original: "CL REAL 1" } }));
    return reply(200, { code: "PRY-2026-001", name: "Test house", current_phase: currentPhase, project_type: "single_family_house" });
  }) as unknown as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

let restore: () => void = () => undefined;
afterEach(() => restore());

describe("phase 2 page · technical data of a real project (RGB-51)", () => {
  it("current phase: the editor loads the project's technical data from the API and it is editable", async () => {
    const stub = stubApi(2);
    restore = stub.restore;
    render(await page("PRY-2026-001", "2"));
    expect(await screen.findByDisplayValue("CL REAL 1")).toBeEnabled();
    expect(stub.calls.filter((c) => c.endsWith("/api/projects/PRY-2026-001/technical-data"))).toHaveLength(1);
  });

  it("a later current phase: the same data, read-only", async () => {
    const stub = stubApi(4);
    restore = stub.restore;
    render(await page("PRY-2026-001", "2"));
    expect(await screen.findByDisplayValue("CL REAL 1")).toBeDisabled();
  });

  it("other phases do not ask for technical data", async () => {
    const stub = stubApi(2);
    restore = stub.restore;
    render(await page("PRY-2026-001", "1"));
    expect(stub.calls.some((c) => c.endsWith("/technical-data"))).toBe(false);
  });

  it("a PRY-EJ sample never asks for technical data", async () => {
    const stub = stubApi(2);
    restore = stub.restore;
    render(await page("PRY-EJ-001", "2"));
    expect(await screen.findByDisplayValue("CL EJEMPLO 12")).toBeInTheDocument();
    expect(stub.calls.some((c) => c.endsWith("/technical-data"))).toBe(false);
  });
});
