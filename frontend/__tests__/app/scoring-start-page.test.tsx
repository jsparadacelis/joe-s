/**
 * RGB-16 integration of `<StartPanel>` in `app/projects/[code]/scoring/page.tsx`.
 * Assumption to agree with the backend: `GET /api/projects/{code}` also returns `project_type`
 * (lib/projects.ts maps it to `Project.projectType`), because `GET /api/plan` needs it.
 * The panel appears only for a real project in phase 0.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import ScoringPage from "@/app/projects/[code]/scoring/page";
import { fetchProject } from "@/lib/projects";

jest.mock("next/navigation", () => ({
  usePathname: () => "/projects/PRY-2026-001/scoring",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const CRITERIA = ["client_fit", "location", "typology", "budget", "timeline", "source", "probability"];
const weights = Object.fromEntries(CRITERIA.map((c) => [c, 1]));
const SETTINGS = { weights, threshold: 60 };
const SCORING = {
  project_code: "PRY-2026-001",
  version: 1,
  ratings: Object.fromEntries(CRITERIA.map((c) => [c, 3])),
  weights,
  threshold: 60,
  score: 60,
  recommendation: "pursue",
  scored_by: "Test user",
  scored_at: "2026-10-24T10:00:00Z",
  history: [{ version: 1, score: 60, recommendation: "pursue", scored_at: "2026-10-24T10:00:00Z" }],
};
const WEEKS = [2, 4, 6, 8, 10, 12, 14];
// Real wire shape: weeks_by_phase is an object keyed "1".."7" (backend/app/api/plan_routes.py).
const WEEKS_OBJECT = { "1": 2, "2": 4, "3": 6, "4": 8, "5": 10, "6": 12, "7": 14 };

const reply = (status: number, body: unknown) => ({ ok: status < 300, status, text: async () => JSON.stringify(body) });

interface Calls {
  urls: string[];
  posts: { url: string; body: unknown }[];
}

function stubApi({ phase = 0, scoringStatus = 200, startReply }: { phase?: number; scoringStatus?: number; startReply?: ReturnType<typeof reply> } = {}) {
  const calls: Calls = { urls: [], posts: [] };
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    calls.urls.push(u);
    if (init?.method === "POST") calls.posts.push({ url: u, body: JSON.parse(String(init.body)) });
    if (u.includes("/api/plan?")) {
      return reply(200, { project_type: "single_family_house", scale: "medium", weeks_by_phase: WEEKS_OBJECT, total: 56 });
    }
    if (u.endsWith("/start")) {
      return (
        startReply ??
        reply(200, {
          code: "PRY-2026-001",
          action: "promote",
          previous_phase: 0,
          current_phase: 1,
          frozen_version: 2,
          plan: { project_type: "single_family_house", scale: "medium", weeks_by_phase: WEEKS_OBJECT, total: 56 },
        })
      );
    }
    if (u.endsWith("/api/settings/scoring")) return reply(200, SETTINGS);
    if (u.endsWith("/scoring")) {
      return scoringStatus === 200
        ? reply(200, SCORING)
        : reply(scoringStatus, { detail: { code: "scoring_not_found", message: "La oportunidad aún no tiene scoring." } });
    }
    return reply(200, { code: "PRY-2026-001", name: "Test house", current_phase: phase, project_type: "single_family_house" });
  }) as unknown as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

let restore: () => void = () => undefined;
afterEach(() => restore());

const page = (code: string) => ScoringPage({ params: Promise.resolve({ code }) });

describe("fetchProject maps the type", () => {
  it("returns projectType from project_type", async () => {
    const request = jest.fn().mockResolvedValue({ code: "PRY-2026-001", name: "Test house", current_phase: 0, project_type: "facility" });
    await expect(fetchProject("PRY-2026-001", request)).resolves.toMatchObject({ projectType: "facility" });
  });
});

describe("/projects/[code]/scoring · start panel", () => {
  it("a real phase-0 project shows the scoring form and, under it, the start panel", async () => {
    const stub = stubApi();
    restore = stub.restore;
    const { container } = render(await page("PRY-2026-001"));
    expect(screen.getAllByRole("combobox")).toHaveLength(7);
    expect(screen.getByRole("heading", { name: "Plan propuesto" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Escala" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No perseguir" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Promover a 1 · Inicio" })).toBeDisabled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("opening the page changes nothing: no POST and no plan request until a scale is chosen", async () => {
    const stub = stubApi();
    restore = stub.restore;
    render(await page("PRY-2026-001"));
    expect(stub.calls.posts).toEqual([]);
    expect(stub.calls.urls.some((u) => u.includes("/api/plan"))).toBe(false);
  });

  it("choosing a scale asks the server for the plan of the project's type and shows it", async () => {
    const stub = stubApi();
    restore = stub.restore;
    const user = userEvent.setup();
    render(await page("PRY-2026-001"));
    await user.click(screen.getByRole("radio", { name: "Media" }));
    expect(await screen.findByLabelText("Semanas de Inicio")).toHaveValue(2);
    const planUrl = new URL(stub.calls.urls.find((u) => u.includes("/api/plan"))!);
    expect(planUrl.searchParams.get("project_type")).toBe("single_family_house");
    expect(planUrl.searchParams.get("scale")).toBe("medium");
    expect(screen.getByText("Total: 56 semanas")).toBeInTheDocument();
  });

  it("promoting from the page POSTs scale and weeks to /start and announces the result", async () => {
    const stub = stubApi();
    restore = stub.restore;
    const user = userEvent.setup();
    render(await page("PRY-2026-001"));
    await user.click(screen.getByRole("radio", { name: "Media" }));
    await screen.findByLabelText("Semanas de Inicio");
    await user.click(screen.getByRole("button", { name: "Promover a 1 · Inicio" }));
    await user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Proyecto promovido a 1 · Inicio"));
    expect(stub.calls.posts).toEqual([
      { url: expect.stringMatching(/\/api\/projects\/PRY-2026-001\/start$/), body: { scale: "medium", weeks: WEEKS } },
    ]);
  });

  it("a 403 from /start is shown in clear Spanish on the page", async () => {
    const stub = stubApi({
      startReply: reply(403, { detail: { code: "no_authority", message: "Solo un socio o un director pueden promover desde la fase 0." } }),
    });
    restore = stub.restore;
    const user = userEvent.setup();
    render(await page("PRY-2026-001"));
    await user.click(screen.getByRole("radio", { name: "Media" }));
    await screen.findByLabelText("Semanas de Inicio");
    await user.click(screen.getByRole("button", { name: "Promover a 1 · Inicio" }));
    await user.click(screen.getByRole("button", { name: "Confirmar promoción" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Solo un socio o un director pueden promover desde la fase 0.");
  });

  it("the panel also shows when the opportunity has no scoring yet (the server enforces it on promote)", async () => {
    const stub = stubApi({ scoringStatus: 404 });
    restore = stub.restore;
    render(await page("PRY-2026-001"));
    expect(screen.getByRole("heading", { name: "Plan propuesto" })).toBeInTheDocument();
  });

  it("a sample project (PRY-EJ-00N) shows no panel and never calls the API", async () => {
    const stub = stubApi();
    restore = stub.restore;
    render(await page("PRY-EJ-002"));
    expect(screen.queryByRole("heading", { name: "Plan propuesto" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "No perseguir" })).not.toBeInTheDocument();
    expect(stub.calls.urls).toEqual([]);
  });

  it("a project past phase 0 shows no panel (scoring and plan are frozen)", async () => {
    const stub = stubApi({ phase: 1 });
    restore = stub.restore;
    render(await page("PRY-2026-001"));
    expect(screen.queryByRole("heading", { name: "Plan propuesto" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Promover a 1 · Inicio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "No perseguir" })).not.toBeInTheDocument();
    expect(screen.getByText("Solo se puede puntuar una oportunidad (fase 0).")).toBeInTheDocument();
  });
});
