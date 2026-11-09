/**
 * RGB-51b · connected editor follow-ups. `TechnicalDataApi` gains
 *   alerts(code): Promise<Alert[]>          (GET .../alerts)
 *   capacity(code): Promise<CapacityAnswer> (GET .../capacity)
 * and `RefreshResult` gains `unavailable: string[]`.
 *  - «unavailable» -> warning «No se pudo consultar: <Polígono INSPIRE · Altitud y pendiente · Producción fotovoltaica>.
 *    Se conservan los datos que ya había; introdúcelos a mano.»; cleared on the next query.
 *  - alerts above the data, reloaded after save, restore, verify, verify-all and query; a failure never blocks.
 *  - capacity of a real project comes from the server; PRY-EJ-* keep the local calculation.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { TechnicalDataEditor } from "@/components/project/technical-data/TechnicalDataEditor";
import { ApiError } from "@/lib/api";
import type { Alert } from "@/lib/alerts-api";
import type { CapacityAnswer } from "@/lib/capacity-api";
import { DEFINITIONS, type TechnicalData } from "@/lib/technical-data";
import { emptyCatalog, fakeTechnicalDataApi } from "../../../helpers/technical-data-fake-api";

jest.setTimeout(30000);
const REF = "1234567DG3413S0001AB";
const CODE = "PRY-2026-001";

const FILLED: TechnicalData = {
  cadastralReference: REF,
  queriedOn: "2026-10-18",
  data: emptyCatalog().map((d) => {
    const def = DEFINITIONS.find((x) => x.id === d.id)!;
    const value = d.id === "address" ? "CL TEST 1" : "";
    return { ...d, value, original: def.group === "planning" ? null : value };
  }),
};
const ALERT: Alert = {
  code: "area_mismatch",
  severity: "warning",
  message: "La superficie del Catastro (96 m²) y la del polígono (99,4 m²) difieren un 3,5 %.",
  suggestion: "Revisa cuál usar como superficie de cálculo.",
  fields: ["cadastralPlotArea", "polygonPlotArea"],
};
const PRD_CAPACITY: CapacityAnswer = {
  capacity: {
    surface: 96, buildableArea: 144, footprint: 67.2, byFloors: 201.6, maximum: 144,
    limitedBy: "buildability", existing: 142, minPlot: null, meetsMinPlot: null,
  },
  missing: [],
};

function mount(options: { code?: string; initial?: TechnicalData | null; query?: () => Promise<TechnicalData> } = {}) {
  const api = fakeTechnicalDataApi({ initial: options.initial === undefined ? FILLED : options.initial, query: options.query });
  const user = userEvent.setup();
  const view = render(
    <main>
      <TechnicalDataEditor
        projectCode={options.code ?? CODE}
        cadastralReference={REF}
        initial={options.initial === undefined ? FILLED : options.initial}
        mode="edit"
        api={api}
      />
    </main>,
  );
  return { api, user, ...view };
}
const control = (label: string) => screen.getByLabelText(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
const querying = () => screen.queryByText("Consultando…");

describe("unavailable sources notice", () => {
  async function query(unavailable: string[] | null, options: Parameters<typeof mount>[0] = {}) {
    const m = mount({ initial: null, query: async () => FILLED, ...options });
    if (unavailable !== null) {
      m.api.refresh.mockResolvedValueOnce({ ...FILLED, unmapped: [], unavailable });
    }
    await m.user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    await screen.findByRole("heading", { name: "Parcela" });
    return m;
  }

  it("lists the unavailable sources by their Spanish names and points to the manual route", async () => {
    await query(["inspire", "open_meteo", "pvgis"]);
    const notice = await screen.findByText(/No se pudo consultar:/);
    expect(notice).toHaveTextContent(
      "No se pudo consultar: Polígono INSPIRE · Altitud y pendiente · Producción fotovoltaica. Se conservan los datos que ya había; introdúcelos a mano.",
    );
    expect(notice.closest('[role="status"]')).not.toBeNull();
  });

  it("names only the sources that failed", async () => {
    await query(["pvgis"]);
    const notice = await screen.findByText(/No se pudo consultar:/);
    expect(notice).toHaveTextContent("No se pudo consultar: Producción fotovoltaica.");
    expect(notice).not.toHaveTextContent("INSPIRE");
  });

  it("with nothing unavailable there is no notice", async () => {
    await query([]);
    expect(screen.queryByText(/No se pudo consultar:/)).not.toBeInTheDocument();
  });

  it("is cleared by a later successful query", async () => {
    const { api, user } = await query(["inspire"]);
    await screen.findByText(/No se pudo consultar:/);
    api.refresh.mockResolvedValueOnce({ ...FILLED, unmapped: [], unavailable: [] });
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    await waitFor(() => expect(querying()).not.toBeInTheDocument());
    expect(screen.queryByText(/No se pudo consultar:/)).not.toBeInTheDocument();
  });

  it("is cleared when the next query fails (only the failure is shown)", async () => {
    const { api, user } = await query(["inspire"]);
    await screen.findByText(/No se pudo consultar:/);
    api.refresh.mockRejectedValueOnce(new ApiError(503, "cadastre_unavailable", "El Catastro no responde."));
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    expect(await screen.findByText("El Catastro no responde.")).toBeInTheDocument();
    expect(screen.queryByText(/Se conservan los datos que ya había/)).not.toBeInTheDocument();
  });

  it("has no axe violations with the notice", async () => {
    const { container } = await query(["inspire", "pvgis"]);
    await screen.findByText(/No se pudo consultar:/);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("alerts", () => {
  it("paints what the server returns", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.alerts.mockResolvedValue([ALERT]);
    render(<TechnicalDataEditor projectCode={CODE} cadastralReference={REF} initial={FILLED} mode="edit" api={api} />);
    expect(await screen.findByText(ALERT.message)).toBeInTheDocument();
    expect(screen.getByText(ALERT.suggestion)).toBeInTheDocument();
    expect(screen.getByText("Aviso")).toBeInTheDocument();
    expect(api.alerts).toHaveBeenCalledWith(CODE);
  });

  it("with no alerts nothing is painted", async () => {
    const { api } = mount();
    await waitFor(() => expect(api.alerts).toHaveBeenCalled());
    expect(screen.queryByText("Aviso")).not.toBeInTheDocument();
    expect(screen.queryByText("Información")).not.toBeInTheDocument();
  });

  async function withAlertThenNone() {
    const api = fakeTechnicalDataApi({ initial: FILLED, query: async () => FILLED });
    api.alerts.mockResolvedValueOnce([ALERT]).mockResolvedValue([]);
    const user = userEvent.setup();
    render(<TechnicalDataEditor projectCode={CODE} cadastralReference={REF} initial={FILLED} mode="edit" api={api} />);
    await screen.findByText(ALERT.message);
    return { api, user };
  }

  it("is reloaded after saving a datum and the alert disappears when the data is fixed", async () => {
    const { api, user } = await withAlertThenNone();
    await user.clear(control("Dirección"));
    await user.type(control("Dirección"), "CL TEST 2");
    await user.tab();
    await waitFor(() => expect(screen.queryByText(ALERT.message)).not.toBeInTheDocument());
    expect(api.alerts).toHaveBeenCalledTimes(2);
  });

  it("is reloaded after verifying a datum", async () => {
    const { api, user } = await withAlertThenNone();
    await user.click(screen.getAllByRole("checkbox")[0]);
    await waitFor(() => expect(api.alerts).toHaveBeenCalledTimes(2));
  });

  it("is reloaded after restoring a datum", async () => {
    const api = fakeTechnicalDataApi({
      initial: { ...FILLED, data: FILLED.data.map((d) => (d.id === "address" ? { ...d, original: "CL ORIGIN 9", edited: true } : d)) },
    });
    const user = userEvent.setup();
    render(
      <TechnicalDataEditor
        projectCode={CODE}
        cadastralReference={REF}
        initial={{ ...FILLED, data: FILLED.data.map((d) => (d.id === "address" ? { ...d, original: "CL ORIGIN 9", edited: true } : d)) }}
        mode="edit"
        api={api}
      />,
    );
    await waitFor(() => expect(api.alerts).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: /Restaurar/ }));
    await waitFor(() => expect(api.restore).toHaveBeenCalled());
    await waitFor(() => expect(api.alerts).toHaveBeenCalledTimes(2));
  });

  it("is reloaded after «Marcar todo como verificado»", async () => {
    const { api, user } = await withAlertThenNone();
    await user.click(screen.getByRole("button", { name: "Marcar todo como verificado" }));
    await waitFor(() => expect(api.alerts).toHaveBeenCalledTimes(2));
  });

  it("is reloaded after a query", async () => {
    const { api, user } = await withAlertThenNone();
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    await waitFor(() => expect(api.refresh).toHaveBeenCalled());
    await waitFor(() => expect(api.alerts).toHaveBeenCalledTimes(2));
  });

  it("a failure loading the alerts does not block the screen", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.alerts.mockRejectedValue(new ApiError(503, "unavailable", "No disponible."));
    const user = userEvent.setup();
    render(<TechnicalDataEditor projectCode={CODE} cadastralReference={REF} initial={FILLED} mode="edit" api={api} />);
    await waitFor(() => expect(api.alerts).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "Parcela" })).toBeInTheDocument();
    expect(control("Dirección")).toBeEnabled();
    await user.type(control("Dirección"), "X");
    await user.tab();
    await waitFor(() => expect(api.edit).toHaveBeenCalled());
  });

  it("has no axe violations with alerts shown", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.alerts.mockResolvedValue([ALERT]);
    const { container } = render(
      <main>
        <TechnicalDataEditor projectCode={CODE} cadastralReference={REF} initial={FILLED} mode="edit" api={api} />
      </main>,
    );
    await screen.findByText(ALERT.message);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("capacity from the server", () => {
  it("PRD case: shows the server figures (144 m²t, limited by buildability) even though the local data is empty", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.capacity.mockResolvedValue(PRD_CAPACITY);
    render(<TechnicalDataEditor projectCode={CODE} cadastralReference={REF} initial={FILLED} mode="edit" api={api} />);
    expect((await screen.findAllByText("144 m²t")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/limita: Edificabilidad/)).toBeInTheDocument();
    expect(api.capacity).toHaveBeenCalledWith(CODE);
  });

  it("shows «Calculando…» while the server answers", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.capacity.mockReturnValue(new Promise(() => {}));
    render(<TechnicalDataEditor projectCode={CODE} cadastralReference={REF} initial={FILLED} mode="edit" api={api} />);
    expect(await screen.findByText("Calculando…")).toBeInTheDocument();
  });

  it("translates `missing` into «Rellena: …»", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.capacity.mockResolvedValue({ capacity: null, missing: ["buildability", "floors"] });
    render(<TechnicalDataEditor projectCode={CODE} cadastralReference={REF} initial={FILLED} mode="edit" api={api} />);
    expect(await screen.findByText(/Rellena: Edificabilidad, Número de plantas/)).toBeInTheDocument();
  });

  it("on failure shows a notice and no figures", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.capacity.mockRejectedValue(new ApiError(503, "unavailable", "No disponible."));
    render(<TechnicalDataEditor projectCode={CODE} cadastralReference={REF} initial={FILLED} mode="edit" api={api} />);
    expect(await screen.findByText(/No se pudo calcular la capacidad/)).toBeInTheDocument();
    expect(screen.queryByText(/techo por edificabilidad/)).not.toBeInTheDocument();
    expect(control("Dirección")).toBeEnabled();
  });

  it("is read again after a save", async () => {
    const { api, user } = mount();
    await waitFor(() => expect(api.capacity).toHaveBeenCalledTimes(1));
    await user.type(control("Dirección"), "X");
    await user.tab();
    await waitFor(() => expect(api.capacity).toHaveBeenCalledTimes(2));
  });

  it("PRY-EJ-* projects keep the local calculation and never ask the server", async () => {
    const local: TechnicalData = {
      ...FILLED,
      data: FILLED.data.map((d) => {
        const values: Record<string, string> = { cadastralPlotArea: "96", calcArea: "Catastral", buildability: "1,5", maxOccupancy: "70", floors: "PB+2" };
        return d.id in values ? { ...d, value: values[d.id] } : d;
      }),
    };
    const api = fakeTechnicalDataApi({ initial: local });
    api.capacity.mockResolvedValue({ capacity: null, missing: ["floors"] });
    render(<TechnicalDataEditor projectCode="PRY-EJ-001" cadastralReference={REF} initial={local} mode="edit" api={api} />);
    expect((await screen.findAllByText("144 m²t")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/limita: Edificabilidad/)).toBeInTheDocument();
    expect(api.capacity).not.toHaveBeenCalled();
    expect(screen.queryByText(/Rellena: /)).not.toBeInTheDocument();
  });
});
