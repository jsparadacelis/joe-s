import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import ScoringPage from "@/app/projects/[code]/scoring/page";
import PhasePage from "@/app/projects/[code]/phase/[phase]/page";

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

interface Stub {
  phase?: number;
  settings?: { status: number; body: unknown };
  scoring?: { status: number; body: unknown };
  project?: { status: number; body: unknown };
}

const reply = (status: number, body: unknown) => ({ ok: status < 300, status, text: async () => JSON.stringify(body) });

/** Answers the endpoints of docs/plans/RGB-14/contract.md with fictitious data. */
function stubApi({ phase = 0, settings, scoring, project }: Stub = {}) {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    calls.push(u);
    if (u.endsWith("/api/settings/scoring")) return reply(settings?.status ?? 200, settings?.body ?? SETTINGS);
    if (u.endsWith("/scoring")) return reply(scoring?.status ?? 200, scoring?.body ?? SCORING);
    return reply(project?.status ?? 200, project?.body ?? { code: "PRY-2026-001", name: "Test house", current_phase: phase });
  }) as unknown as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

let restore: () => void = () => undefined;
afterEach(() => restore());

const page = (code: string) => ScoringPage({ params: Promise.resolve({ code }) });
const NOT_FOUND = { detail: { code: "scoring_not_found", message: "La oportunidad aún no tiene scoring." } };

describe("/projects/[code]/scoring", () => {
  it("real phase-0 project: heading, seven selectors and the latest scoring", async () => {
    const stub = stubApi();
    restore = stub.restore;
    const { container } = render(await page("PRY-2026-001"));
    expect(screen.getByRole("heading", { level: 1, name: "Test house" })).toBeInTheDocument();
    expect(screen.getAllByRole("combobox")).toHaveLength(7);
    expect(screen.getByRole("region", { name: "Última puntuación" })).toBeInTheDocument();
    expect(stub.calls.some((c) => c.endsWith("/api/settings/scoring"))).toBe(true);
    expect(stub.calls.some((c) => c.endsWith("/api/projects/PRY-2026-001/scoring"))).toBe(true);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("a project without scoring yet shows an empty form", async () => {
    const stub = stubApi({ scoring: { status: 404, body: NOT_FOUND } });
    restore = stub.restore;
    render(await page("PRY-2026-001"));
    expect(screen.getAllByRole("combobox")).toHaveLength(7);
    expect(screen.queryByRole("region", { name: "Última puntuación" })).not.toBeInTheDocument();
    expect(screen.getByText("Sin puntuaciones todavía")).toBeInTheDocument();
  });

  it("a sample project says «Sin API» and never calls the API", async () => {
    const stub = stubApi();
    restore = stub.restore;
    render(await page("PRY-EJ-002"));
    expect(screen.getByText("Sin API")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(stub.calls).toEqual([]);
  });

  it("a project past phase 0 cannot be scored but keeps its history", async () => {
    const stub = stubApi({ phase: 2 });
    restore = stub.restore;
    render(await page("PRY-2026-001"));
    expect(screen.getByText("Solo se puede puntuar una oportunidad (fase 0).")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar puntuación" })).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Historial de puntuaciones" })).toBeInTheDocument();
  });

  it("shows the API error and no form when the settings cannot be loaded", async () => {
    const stub = stubApi({ settings: { status: 500, body: {} } });
    restore = stub.restore;
    render(await page("PRY-2026-001"));
    expect(screen.getByRole("alert")).toHaveTextContent("Ocurrió un error inesperado. Inténtalo de nuevo.");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows the API error when the scoring cannot be read (not a 404)", async () => {
    const stub = stubApi({ scoring: { status: 500, body: {} } });
    restore = stub.restore;
    render(await page("PRY-2026-001"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("an unknown project is a 404", async () => {
    const stub = stubApi({
      project: { status: 404, body: { detail: { code: "project_not_found", message: "No existe el proyecto X." } } },
    });
    restore = stub.restore;
    await expect(page("PRY-2026-999")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("link «Puntuar oportunidad» from the phase page", () => {
  const phasePage = (code: string, phase: string) => PhasePage({ params: Promise.resolve({ code, phase }) });

  it("appears for a real project in phase 0", async () => {
    const stub = stubApi({ phase: 0 });
    restore = stub.restore;
    render(await phasePage("PRY-2026-001", "0"));
    expect(screen.getByRole("link", { name: "Puntuar oportunidad" })).toHaveAttribute("href", "/projects/PRY-2026-001/scoring");
  });

  it("does not appear for a real project past phase 0", async () => {
    const stub = stubApi({ phase: 2 });
    restore = stub.restore;
    render(await phasePage("PRY-2026-001", "2"));
    expect(screen.queryByRole("link", { name: "Puntuar oportunidad" })).not.toBeInTheDocument();
  });

  it("does not appear when looking at another phase of a phase-0 project", async () => {
    const stub = stubApi({ phase: 0 });
    restore = stub.restore;
    render(await phasePage("PRY-2026-001", "1"));
    expect(screen.queryByRole("link", { name: "Puntuar oportunidad" })).not.toBeInTheDocument();
  });

  it("does not appear for a sample project in phase 0", async () => {
    const stub = stubApi();
    restore = stub.restore;
    render(await phasePage("PRY-EJ-002", "0"));
    expect(screen.queryByRole("link", { name: "Puntuar oportunidad" })).not.toBeInTheDocument();
  });
});
