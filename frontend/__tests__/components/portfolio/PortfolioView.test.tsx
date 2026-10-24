import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { PortfolioView } from "@/components/portfolio/PortfolioView";
import { ApiError } from "@/lib/api";
import type { Portfolio } from "@/lib/portfolio";
import { ROWS, TODAY, makeRow, portfolioOf } from "../../helpers/portfolio-rows";

// F3: next/link schedules an async router update that triggers `act(...)` warnings in jsdom; a plain anchor is enough here.
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const UNEXPECTED = "Ocurrió un error inesperado. Inténtalo de nuevo.";
const NO_RESULTS = "Ningún proyecto coincide con los filtros";

function setup(fetcher: jest.Mock = jest.fn().mockResolvedValue(portfolioOf(ROWS))) {
  const user = userEvent.setup();
  const view = render(<PortfolioView fetcher={fetcher} today={TODAY} />);
  return { fetcher, user, ...view };
}

async function loaded(fetcher?: jest.Mock) {
  const ctx = setup(fetcher);
  await screen.findByRole("table", { name: "Proyectos de la cartera" });
  return ctx;
}

const summaryValue = (label: string) => screen.getByText(label).closest("div")?.querySelector("dd")?.textContent;
const bodyRows = () => screen.getAllByRole("row").slice(1);
const status = () => screen.getByRole("combobox", { name: "Semáforo" });
const owner = () => screen.getByRole("combobox", { name: "Responsable" });

describe("PortfolioView states", () => {
  it("loading: shows «Cargando la cartera…» and no table", async () => {
    setup(jest.fn(() => new Promise(() => {})));
    expect(screen.getByText("Cargando la cartera…")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("calls the fetcher once on mount", async () => {
    const { fetcher } = await loaded();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("error with a readable message: alert with the API message and a «Reintentar» button", async () => {
    const message = "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.";
    setup(jest.fn().mockRejectedValue(new ApiError(0, "network_error", message)));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Cargando la cartera…")).not.toBeInTheDocument();
  });

  it("error that is not an ApiError: generic message", async () => {
    setup(jest.fn().mockRejectedValue(new Error("boom internal detail")));
    expect(await screen.findByRole("alert")).toHaveTextContent(UNEXPECTED);
    expect(screen.queryByText(/boom internal detail/)).not.toBeInTheDocument();
  });

  it("«Reintentar» fetches again and shows the table when it works", async () => {
    const fetcher = jest.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue(portfolioOf(ROWS));
    const { user } = setup(fetcher);
    await user.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("table", { name: "Proyectos de la cartera" })).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("«Reintentar» that fails again keeps the error", async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error("x"));
    const { user } = setup(fetcher);
    await user.click(await screen.findByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toHaveTextContent(UNEXPECTED);
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("empty portfolio: empty state, without summary, filters or table", async () => {
    setup(jest.fn().mockResolvedValue(portfolioOf([])));
    expect(await screen.findByText("Aún no hay proyectos en la cartera")).toBeInTheDocument();
    expect(screen.getByText("Cuando se creen proyectos, aparecerán aquí con su fase y su semáforo.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Resumen de la cartera" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filtros de la cartera" })).not.toBeInTheDocument();
  });

  it("does not update state after unmount (no warnings)", async () => {
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    let resolve!: (portfolio: Portfolio) => void;
    const fetcher = jest.fn(() => new Promise<Portfolio>((r) => (resolve = r)));
    const { unmount } = setup(fetcher);
    unmount();
    await act(async () => resolve(portfolioOf(ROWS)));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe("PortfolioView phase weeks (RGB-23)", () => {
  it("loaded: shows the «Semanas de la fase» column with the weeks of each project", async () => {
    await loaded();
    expect(screen.getByRole("columnheader", { name: "Semanas de la fase" })).toBeInTheDocument();
    expect(screen.getByText("2 / 5 sem.")).toBeInTheDocument();
    expect(screen.getByText("9 / 8 sem.")).toBeInTheDocument();
    expect(screen.getByText("Reloj parado")).toBeInTheDocument();
    expect(screen.getByText("Sin plan hasta promover")).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(ROWS.length - 1);
  });

  it("filtering keeps the column; the summary does not change", async () => {
    const { user } = await loaded();
    await user.selectOptions(status(), "Plan superado");
    expect(screen.getByRole("columnheader", { name: "Semanas de la fase" })).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
    expect(screen.getByText("9 / 8 sem.")).toBeInTheDocument();
    expect(summaryValue("Proyectos activos")).toBe("5");
    expect(summaryValue("En riesgo")).toBe("2");
  });

  it("with the new column: no accessibility violations", async () => {
    const { container } = await loaded();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("PortfolioView loaded", () => {
  it("shows summary, filters and one table row per project", async () => {
    await loaded();
    expect(screen.getByRole("region", { name: "Resumen de la cartera" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Filtros de la cartera" })).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(ROWS.length);
    expect(screen.queryByText("Cargando la cartera…")).not.toBeInTheDocument();
  });

  it("summary uses the injected today and matches the table", async () => {
    await loaded();
    expect(summaryValue("Proyectos activos")).toBe("5");
    expect(summaryValue("En riesgo")).toBe("2");
    expect(summaryValue("Hitos en 7 días")).toBe("2");
    expect(summaryValue("Fichas desactualizadas")).toBe("2");
    // the same figures counted from the table itself
    expect(bodyRows()).toHaveLength(5);
    // scoped to the table: the status filter also has "Atención" and "Plan superado" options
    expect(within(screen.getByRole("table")).getAllByText(/^(Atención|Plan superado)$/)).toHaveLength(2);
    expect(screen.getAllByText("Desactualizada")).toHaveLength(2);
  });

  it("without the today prop the summary uses the as_of date of the portfolio (RGB-13)", async () => {
    // Real time is far from the fixtures: only `asOf` can make the milestone of 2026-10-26 fall inside the window.
    render(<PortfolioView fetcher={jest.fn().mockResolvedValue(portfolioOf(ROWS, TODAY))} />);
    await screen.findByRole("table");
    expect(summaryValue("Hitos en 7 días")).toBe("2");
  });

  it("the today prop wins over as_of", async () => {
    render(<PortfolioView fetcher={jest.fn().mockResolvedValue(portfolioOf(ROWS, "2030-01-01"))} today={TODAY} />);
    await screen.findByRole("table");
    expect(summaryValue("Hitos en 7 días")).toBe("2");
  });

  it("without today and without as_of (empty string) falls back to the current date", async () => {
    jest.useFakeTimers({ advanceTimers: true, now: new Date("2026-06-01T12:00:00Z") });
    try {
      const rows = [
        makeRow({ code: "PRY-EJ-920", nextMilestone: { name: "M", date: "2026-06-02" } }),
        makeRow({ code: "PRY-EJ-921", nextMilestone: { name: "M", date: "2026-06-20" } }),
      ];
      render(<PortfolioView fetcher={jest.fn().mockResolvedValue(portfolioOf(rows, ""))} />);
      await screen.findByRole("table");
      expect(summaryValue("Hitos en 7 días")).toBe("1");
    } finally {
      jest.useRealTimers();
    }
  });

  it("the owner select lists each owner once, sorted", async () => {
    await loaded();
    const names = within(owner()).getAllByRole("option").map((o) => o.textContent);
    expect(names).toEqual(["Todos", "Ana Test", "Beto Test", "Carla Test"]);
  });

  it("announces how many projects are shown in a status region", async () => {
    await loaded();
    expect(screen.getByText("Mostrando 5 de 5 proyectos")).toBeInTheDocument();
    expect(screen.getByText("Mostrando 5 de 5 proyectos").closest("[role=status]")).not.toBeNull();
  });
});

describe("PortfolioView filters", () => {
  it("filters by traffic light", async () => {
    const { user } = await loaded();
    await user.selectOptions(status(), "Atención");
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByRole("link", { name: /PRY-EJ-902/ })).toBeInTheDocument();
    expect(screen.getByText("Mostrando 1 de 5 proyectos")).toBeInTheDocument();
  });

  it.each([
    ["En plazo", "PRY-EJ-901"],
    ["Plan superado", "PRY-EJ-903"],
    ["En pausa", "PRY-EJ-904"],
    ["Sin plan", "PRY-EJ-905"],
  ])("status filter «%s» shows %s only", async (label, code) => {
    const { user } = await loaded();
    await user.selectOptions(status(), label);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: new RegExp(code) })).toBeInTheDocument();
  });

  it("filters by owner", async () => {
    const { user } = await loaded();
    await user.selectOptions(owner(), "Beto Test");
    expect(screen.getAllByRole("link").map((l) => l.textContent)).toEqual([
      expect.stringContaining("PRY-EJ-903"),
      expect.stringContaining("PRY-EJ-904"),
    ]);
  });

  it("the two filters combine", async () => {
    const { user } = await loaded();
    await user.selectOptions(owner(), "Ana Test");
    expect(bodyRows()).toHaveLength(2);
    await user.selectOptions(status(), "En plazo");
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByRole("link", { name: /PRY-EJ-901/ })).toBeInTheDocument();
  });

  it("going back to «Todos» restores the rows", async () => {
    const { user } = await loaded();
    await user.selectOptions(status(), "Plan superado");
    expect(bodyRows()).toHaveLength(1);
    await user.selectOptions(status(), "Todos");
    expect(bodyRows()).toHaveLength(5);
  });

  it("the summary does not change with the filters (it describes the whole portfolio)", async () => {
    const { user } = await loaded();
    await user.selectOptions(status(), "En plazo");
    expect(summaryValue("Proyectos activos")).toBe("5");
    expect(summaryValue("En riesgo")).toBe("2");
    expect(summaryValue("Hitos en 7 días")).toBe("2");
    expect(summaryValue("Fichas desactualizadas")).toBe("2");
  });

  it("the owner options do not shrink when a status filter is applied", async () => {
    const { user } = await loaded();
    await user.selectOptions(status(), "Sin plan");
    expect(within(owner()).getAllByRole("option")).toHaveLength(4);
  });

  it("no results: notice «Ningún proyecto coincide con los filtros», no table, filters kept", async () => {
    const { user } = await loaded();
    await user.selectOptions(owner(), "Ana Test");
    await user.selectOptions(status(), "Plan superado");
    expect(screen.getByText(NO_RESULTS)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Mostrando 0 de 5 proyectos")).toBeInTheDocument();
    expect(status()).toHaveValue("red");
    expect(owner()).toHaveValue("Ana Test");
    // it is not the empty portfolio
    expect(screen.queryByText("Aún no hay proyectos en la cartera")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Resumen de la cartera" })).toBeInTheDocument();
  });

  it("no results: relaxing a filter brings the table back", async () => {
    const { user } = await loaded();
    await user.selectOptions(owner(), "Ana Test");
    await user.selectOptions(status(), "Plan superado");
    await user.selectOptions(status(), "Todos");
    expect(screen.queryByText(NO_RESULTS)).not.toBeInTheDocument();
    expect(bodyRows()).toHaveLength(2);
  });

  it("the notice is not shown while there are results", async () => {
    await loaded();
    expect(screen.queryByText(NO_RESULTS)).not.toBeInTheDocument();
  });
});

describe("PortfolioView accessibility", () => {
  it("loading: no violations", async () => {
    const { container } = setup(jest.fn(() => new Promise(() => {})));
    expect(await axe(container)).toHaveNoViolations();
  });

  it("error: no violations", async () => {
    const { container } = setup(jest.fn().mockRejectedValue(new Error("x")));
    await screen.findByRole("alert");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("empty: no violations", async () => {
    const { container } = setup(jest.fn().mockResolvedValue(portfolioOf([])));
    await screen.findByText("Aún no hay proyectos en la cartera");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("loaded: no violations", async () => {
    const { container } = await loaded();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("filtered: no violations", async () => {
    const { container, user } = await loaded();
    await user.selectOptions(status(), "Atención");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("no results: no violations", async () => {
    const { container, user } = await loaded();
    await user.selectOptions(owner(), "Carla Test");
    await user.selectOptions(status(), "En plazo");
    await screen.findByText(NO_RESULTS);
    expect(await axe(container)).toHaveNoViolations();
  });
});
