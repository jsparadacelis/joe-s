import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { phaseWeeksProgress } from "@/lib/portfolio";
import { TRAFFIC_LIGHT_LABEL } from "@/lib/timing";
import PortfolioPage, { metadata } from "@/app/portfolio/page";
import { SAMPLE_ROWS, apiProject, toApiPortfolio } from "../helpers/portfolio-sample";

// RGB-13: the page reads GET /api/portfolio through the global fetch; the sample rows are test fixtures.
function mockApi(body: unknown, status = 200) {
  const fetchMock = jest.fn().mockResolvedValue({ ok: status < 300, status, text: async () => JSON.stringify(body) });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const originalFetch = globalThis.fetch;
beforeEach(() => mockApi(toApiPortfolio(SAMPLE_ROWS)));
afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe("/portfolio", () => {
  it("has the title «Cartera» in the metadata", () => {
    expect(metadata.title).toBe("Cartera");
  });

  it("renders PageHead with a single h1 and its description", async () => {
    render(<PortfolioPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Cartera" })).toBeInTheDocument();
    expect(screen.getByText("Visión general de los proyectos activos y su estado.")).toBeInTheDocument();
    await screen.findByRole("table");
  });

  it("renders the view: summary, filters and the projects linked to their current phase", async () => {
    render(<PortfolioPage />);
    expect(await screen.findByRole("table", { name: "Proyectos de la cartera" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Resumen de la cartera" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Filtros de la cartera" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /PRY-EJ-001/ })).toHaveAttribute("href", "/projects/PRY-EJ-001/phase/3");
    expect(screen.queryByText("Aún no hay proyectos en la cartera")).not.toBeInTheDocument();
  });

  it("asks the API: GET /api/portfolio", async () => {
    const fetchMock = mockApi(toApiPortfolio(SAMPLE_ROWS));
    render(<PortfolioPage />);
    await screen.findByRole("table");
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/portfolio$/);
  });

  it("no accessibility violations once loaded", async () => {
    const { container } = render(
      <main>
        <PortfolioPage />
      </main>,
    );
    await screen.findByRole("table");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("/portfolio · «Nueva oportunidad» (RGB-13)", () => {
  it("shows a link-button in the header that goes to /opportunities/new", async () => {
    render(<PortfolioPage />);
    const link = screen.getByRole("link", { name: "Nueva oportunidad" });
    expect(link).toHaveAttribute("href", "/opportunities/new");
    await screen.findByRole("table");
  });

  it("is also available when the portfolio is empty or fails to load", async () => {
    mockApi({ as_of: "2026-10-24", projects: [] });
    const { unmount } = render(<PortfolioPage />);
    await screen.findByText("Aún no hay proyectos en la cartera");
    expect(screen.getByRole("link", { name: "Nueva oportunidad" })).toBeInTheDocument();
    unmount();

    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError("offline")) as unknown as typeof fetch;
    render(<PortfolioPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar con el servidor.");
    expect(screen.getByRole("link", { name: "Nueva oportunidad" })).toBeInTheDocument();
  });
});

describe("/portfolio · a freshly created opportunity (RGB-13)", () => {
  it("shows «Sin plan hasta promover», the «Sin plan» chip and links to its phase 0", async () => {
    mockApi({
      as_of: "2026-10-24",
      projects: [apiProject({ code: "PRY-2026-001", name: "Test opportunity", owner_id: "Ana Test" })],
    });
    render(<PortfolioPage />);
    const link = await screen.findByRole("link", { name: /PRY-2026-001/ });
    expect(link).toHaveAttribute("href", "/projects/PRY-2026-001/phase/0");
    const row = within(link.closest("tr")!);
    expect(row.getByText("Sin plan hasta promover")).toBeInTheDocument();
    expect(row.getByText("Sin plan")).toBeInTheDocument();
    expect(row.getByText("Ana Test")).toBeInTheDocument();
    expect(row.getByText("Sin hito próximo")).toBeInTheDocument();
  });

  it("an unknown project shows «Sin calcular» and is not counted as at risk; an undated milestone says «Sin fecha»", async () => {
    mockApi({
      as_of: "2026-10-24",
      projects: [
        apiProject({
          code: "PRY-2026-002",
          phase: 2,
          status: "unknown",
          owner_id: null,
          next_milestone: { name: "Kick-off", date: null },
        }),
      ],
    });
    render(<PortfolioPage />);
    const link = await screen.findByRole("link", { name: /PRY-2026-002/ });
    const row = within(link.closest("tr")!);
    expect(row.getAllByText("Sin calcular")).toHaveLength(2); // chip + weeks cell
    expect(row.getByText("Sin responsable")).toBeInTheDocument();
    expect(row.getByText("Sin fecha")).toBeInTheDocument();
    const atRisk = screen.getByText("En riesgo").closest("div")!.querySelector("dd")!;
    expect(atRisk).toHaveTextContent("0");
  });

  it("the summary uses the as_of of the API as «today»", async () => {
    mockApi({
      as_of: "2031-05-01",
      projects: [apiProject({ phase: 2, status: "green", next_milestone: { name: "M", date: "2031-05-03" }, phase_weeks: { active: 1, planned: 3 } })],
    });
    render(<PortfolioPage />);
    await screen.findByRole("table");
    expect(screen.getByText("Hitos en 7 días").closest("div")!.querySelector("dd")).toHaveTextContent("1");
  });
});

// RGB-23: the weeks and the light of each row. Before RGB-13 this test compared the page with the
// sample timing plans («Plan y tiempos»). The portfolio is real now (weeks come from the API), so the
// check is: whatever weeks the API sends are what the row shows, with the colour of phaseWeeksProgress.
describe("/portfolio phase weeks (RGB-23)", () => {
  it("every row shows the weeks, the light and the bar colour of its phaseWeeks", async () => {
    render(<PortfolioPage />);
    await screen.findByRole("table", { name: "Proyectos de la cartera" });
    const tokens = { green: "bg-ok", amber: "bg-warn", red: "bg-bad" } as const;
    let withPlan = 0;
    for (const r of SAMPLE_ROWS) {
      const view = within(screen.getByRole("link", { name: new RegExp(r.code) }).closest("tr")!);
      const progress = phaseWeeksProgress(r);
      if (!r.phaseWeeks || !progress) {
        expect(view.getByText("Sin plan hasta promover")).toBeInTheDocument();
        expect(view.queryByRole("progressbar")).not.toBeInTheDocument();
        continue;
      }
      withPlan += 1;
      expect(view.getByText(`${r.phaseWeeks.active} / ${r.phaseWeeks.planned} sem.`)).toBeInTheDocument();
      const bar = view.getByRole("progressbar");
      expect(bar).toHaveAttribute("aria-valuetext", `${progress.percent} % del plan`);
      if (r.status === "paused") {
        expect(view.getByText("Reloj parado")).toBeInTheDocument();
        expect(view.getByText("En pausa")).toBeInTheDocument();
        expect(bar.firstElementChild).toHaveClass("bg-off");
      } else {
        expect(view.getByText(TRAFFIC_LIGHT_LABEL[progress.trafficLight])).toBeInTheDocument();
        expect(bar.firstElementChild).toHaveClass(tokens[progress.trafficLight]);
      }
    }
    expect(withPlan).toBeGreaterThanOrEqual(5);
  });
});
