import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import PlanAndTimingPage from "@/app/projects/[code]/plan-and-timing/page";

jest.mock("next/navigation", () => ({
  usePathname: () => "/projects/PRY-2026-001/plan-and-timing",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const page = (code: string) => PlanAndTimingPage({ params: Promise.resolve({ code }) });

const PAUSE = {
  id: "p1",
  phase: 2,
  reason: "authority_wait",
  started_on: "2026-10-12",
  expected_resumption: "2026-11-09",
  resumed_on: null,
  overdue: false,
  days_overdue: 0,
};

interface Stub {
  phase: number;
  pauses?: unknown;
  pausesStatus?: number;
}

/** Answers GET /api/projects/{code} and GET /api/projects/{code}/pauses like the API of RGB-13/RGB-21. */
function stubApi({ phase, pauses = { active: null, history: [] }, pausesStatus = 200 }: Stub) {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    calls.push(String(url));
    if (String(url).endsWith("/pauses")) {
      return {
        ok: pausesStatus === 200,
        status: pausesStatus,
        text: async () =>
          JSON.stringify(
            pausesStatus === 200 ? pauses : { detail: { code: "project_not_found", message: "No existe el proyecto X." } },
          ),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ code: "PRY-2026-001", name: "Test house", current_phase: phase }),
    };
  }) as unknown as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

let restore: () => void = () => undefined;
afterEach(() => restore());

describe("«Plan y tiempos» of a real project (RGB-21)", () => {
  it("phase 0: keeps «Sin plan hasta promover», no pause buttons and no call to /pauses", async () => {
    const stub = stubApi({ phase: 0 });
    restore = stub.restore;
    render(await page("PRY-2026-001"));
    expect(screen.getByText("Sin plan hasta promover")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pausar proyecto" })).not.toBeInTheDocument();
    expect(stub.calls.some((c) => c.endsWith("/pauses"))).toBe(false);
  });

  it("phase > 0 without a pause: weeks «Sin calcular» (never «Sin plan hasta promover») and the pause button", async () => {
    const stub = stubApi({ phase: 1 });
    restore = stub.restore;
    render(await page("PRY-2026-001"));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Test house" })).toBeInTheDocument();
    expect(screen.getByText("Sin calcular")).toBeInTheDocument();
    expect(screen.queryByText("Sin plan hasta promover")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pausar proyecto" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reanudar" })).not.toBeInTheDocument();
    expect(stub.calls.some((c) => c.endsWith("/api/projects/PRY-2026-001/pauses"))).toBe(true);
  });

  it("phase > 0 with an overdue active pause and history: shows both", async () => {
    const stub = stubApi({
      phase: 2,
      pauses: {
        active: { ...PAUSE, overdue: true, days_overdue: 4 },
        history: [{ ...PAUSE, id: "p0", phase: 1, reason: "client_wait", resumed_on: "2026-09-01" }],
      },
    });
    restore = stub.restore;
    render(await page("PRY-2026-001"));
    expect(screen.getByRole("heading", { name: "Pausa activa" })).toBeInTheDocument();
    expect(screen.getByText("Vencida hace 4 días")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reanudar" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Historial de pausas del proyecto" })).toBeInTheDocument();
  });

  it("if the pauses cannot be read it says so in an alert instead of breaking the page", async () => {
    const stub = stubApi({ phase: 2, pausesStatus: 404 });
    restore = stub.restore;
    render(await page("PRY-2026-001"));
    expect(screen.getByRole("alert")).toHaveTextContent("No existe el proyecto X.");
    expect(screen.getByRole("heading", { level: 1, name: "Test house" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pausar proyecto" })).not.toBeInTheDocument();
  });

  it("no accessibility violations", async () => {
    const stub = stubApi({ phase: 2, pauses: { active: { ...PAUSE, overdue: true, days_overdue: 2 }, history: [] } });
    restore = stub.restore;
    const { container } = render(<main>{await page("PRY-2026-001")}</main>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("the PRY-EJ samples keep their sample plan, show no pause buttons and do not touch the network", async () => {
    const stub = stubApi({ phase: 3 });
    restore = stub.restore;
    render(await page("PRY-EJ-003"));
    expect(screen.getAllByRole("progressbar")).toHaveLength(7);
    expect(screen.queryByRole("button", { name: "Pausar proyecto" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reanudar" })).not.toBeInTheDocument();
    expect(stub.calls).toEqual([]);
  });
});
