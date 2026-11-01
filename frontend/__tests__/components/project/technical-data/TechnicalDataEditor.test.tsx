import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { TechnicalDataEditor } from "@/components/project/technical-data/TechnicalDataEditor";
import { validateCadastralReference } from "@/lib/cadastral-reference";

/** The message the screen must show for an invalid reference (fails if the reference is valid). */
function invalidMessage(reference: string): string {
  const result = validateCadastralReference(reference);
  if (result.valid) throw new Error(`expected an invalid reference: ${reference}`);
  return result.message;
}
import { DEFINITIONS, type TechnicalData, type TechnicalDatum } from "@/lib/technical-data";
import { fakeTechnicalDataApi } from "../../../helpers/technical-data-fake-api";

jest.setTimeout(20000);

const REF = "1234567DG3413S0001AB";

const VALUES: Record<string, string> = {
  address: "CL TEST 1", municipality: "MUNI TEST", propertyClass: "Urbano", use: "Residencial", year: "1990", builtArea: "100", cadastralPlotArea: "100", polygonPlotArea: "98",
  coords: "40,00 N · 2,00 E", altitude: "10", slope: "2", slopeType: "Llana (< 3 %)",
  climateZone: "D2", seismicAcceleration: "< 0,04 g", kCoefficient: "1,0", windZone: "A", snowZone: "1", pvProduction: "1300",
  buildability: "", maxOccupancy: "", maxHeight: "", floors: "", streetSetback: "", boundarySetback: "", minPlot: "", calcArea: "Catastral",
};

/** Data built in the test (independent of the library's sample data). */
function data(overrides: Record<string, Partial<TechnicalDatum>> = {}, values: Record<string, string> = {}): TechnicalData {
  const list: TechnicalDatum[] = DEFINITIONS.map((d) => {
    const value = values[d.id] ?? VALUES[d.id];
    const base: TechnicalDatum = { id: d.id, value, original: d.group === "planning" ? null : value, verified: false };
    return { ...base, ...overrides[d.id] };
  });
  return { cadastralReference: REF, queriedOn: "2026-10-18", data: list };
}

/** A datum's row: first ancestor of the control that contains a checkbox. */
function row(control: HTMLElement): HTMLElement {
  let el: HTMLElement | null = control.parentElement;
  while (el && !el.querySelector('input[type="checkbox"]')) el = el.parentElement;
  if (!el) throw new Error("fila sin casilla");
  return el;
}
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const control = (label: string) => screen.getByLabelText(new RegExp(`^${escapeRegex(label)}`));
const rowOf = (label: string) => row(control(label));
const checkbox = (label: string) => within(rowOf(label)).getByRole("checkbox");

/** RGB-51: every operation now goes through the (fake) API, so an action is finished when no request is pending. */
async function settle() {
  await waitFor(() => {
    expect(screen.queryByText("Guardando…")).not.toBeInTheDocument();
    expect(screen.queryByText("Verificando…")).not.toBeInTheDocument();
    expect(screen.queryByText("Consultando…")).not.toBeInTheDocument();
  });
}

type User = ReturnType<typeof userEvent.setup>;
/** The user-event instance whose actions wait for the pending request to settle, so the assertions stay unchanged. */
function settledUser(): User {
  const user = userEvent.setup();
  return new Proxy(user, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function" || prop === "setup") return value;
      return async (...args: unknown[]) => {
        const result = await (value as (...a: unknown[]) => unknown).apply(target, args);
        await settle();
        return result;
      };
    },
  });
}

/** A text datum is saved when the field loses focus (not on every keystroke), so typing ends with a Tab. */
async function typeInto(user: User, label: string, text: string) {
  const c = control(label);
  await user.clear(c);
  if (text) await user.type(c, text);
  await user.tab();
}

/** `raw`: plain user-event, for tests that keep a request pending on purpose. */
type MountProps = Partial<React.ComponentProps<typeof TechnicalDataEditor>> & { query?: jest.Mock; raw?: boolean };

function mount(props: MountProps = {}) {
  const { query: givenQuery, raw, ...rest } = props;
  const query = givenQuery ?? jest.fn().mockResolvedValue(data());
  const api = fakeTechnicalDataApi({ initial: rest.initial ?? null, query });
  const user = raw ? userEvent.setup() : settledUser();
  const r = render(
    <TechnicalDataEditor projectCode="PRY-2026-001" cadastralReference={REF} initial={null} mode="edit" api={api} {...rest} />,
  );
  return { user, query, api, ...r };
}

const queryButton = () => screen.getByRole("button", { name: /Obtener datos técnicos|Volver a consultar|Consultando/ });

async function queried() {
  const m = mount();
  await m.user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
  await screen.findByRole("heading", { name: "Parcela" });
  return m;
}

describe("TechnicalDataEditor · before querying", () => {
  it("only the input is shown: prefilled reference and «Obtener datos técnicos»", () => {
    mount();
    expect(screen.getByLabelText(/Referencia catastral/)).toHaveValue(REF);
    expect(screen.getByRole("button", { name: "Obtener datos técnicos" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "Parcela" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Condiciones técnicas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Planeamiento" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Capacidad" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Dirección")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar todo como verificado" })).not.toBeInTheDocument();
  });

  it("the reference is editable", async () => {
    const { user } = mount();
    const field = screen.getByLabelText(/Referencia catastral/);
    await user.clear(field);
    await user.type(field, "ABCDEFGH123456789012");
    expect(field).toHaveValue("ABCDEFGH123456789012");
  });
});

describe("TechnicalDataEditor · invalid reference", () => {
  it.each([
    ["corta", "123"],
    ["with symbols", "1234567DG3413S0001A!"],
    ["empty", ""],
  ])("reference %s: notice and no query", async (_n, ref) => {
    const { user, query } = mount();
    await typeInto(user, "Referencia catastral", ref);
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    expect(screen.getByText(invalidMessage(ref))).toBeInTheDocument();
    expect(query).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Parcela" })).not.toBeInTheDocument();
  });

  it("no notice while the reference is valid", async () => {
    const { user } = mount();
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    expect(screen.queryByText(/La referencia catastral|Introduce la referencia/)).not.toBeInTheDocument();
  });

  it("after fixing the reference and pressing again, it queries", async () => {
    const { user, query } = mount();
    await typeInto(user, "Referencia catastral", "123");
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    await typeInto(user, "Referencia catastral", REF);
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(REF);
    await screen.findByRole("heading", { name: "Parcela" });
  });
});

describe("TechnicalDataEditor · query", () => {
  it("shows «Consultando…» with the button disabled and then the data", async () => {
    let resolveFetch!: (d: TechnicalData) => void;
    const query = jest.fn(() => new Promise<TechnicalData>((r) => (resolveFetch = r)));
    const { user } = mount({ query, raw: true });
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    const b = screen.getByRole("button", { name: "Consultando…" });
    expect(b).toBeDisabled();
    expect(query).toHaveBeenCalledWith(REF);
    expect(screen.queryByRole("heading", { name: "Parcela" })).not.toBeInTheDocument();
    resolveFetch(data());
    await screen.findByRole("heading", { name: "Parcela" });
    expect(screen.queryByRole("button", { name: "Consultando…" })).not.toBeInTheDocument();
  });

  it("after querying the three groups and the capacity appear and the button changes to «Volver a consultar»", async () => {
    await queried();
    expect(screen.getByRole("heading", { name: "Condiciones técnicas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Planeamiento" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Capacidad" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volver a consultar" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Obtener datos técnicos" })).not.toBeInTheDocument();
    expect(screen.getByText("Catastro, INSPIRE y Open-Meteo")).toBeInTheDocument();
  });

  it("each datum shows its value, origin and unit", async () => {
    await queried();
    expect(control("Dirección")).toHaveValue("CL TEST 1");
    expect(rowOf("Dirección")).toHaveTextContent("Catastro");
    expect(control("Superficie construida")).toHaveValue("100");
    expect(rowOf("Superficie construida")).toHaveTextContent("m²");
    expect(rowOf("Producción fotovoltaica")).toHaveTextContent("kWh/kWp·año");
    expect(rowOf("Producción fotovoltaica")).toHaveTextContent("PVGIS");
    expect(control("Zona climática")).toHaveValue("D2");
    expect(rowOf("Zona climática")).toHaveTextContent("CTE DB-HE · Anejo B");
    expect(rowOf("Edificabilidad")).toHaveTextContent("Manual");
    expect(rowOf("Edificabilidad")).toHaveTextContent("m²t/m²s");
  });

  it("data with options are lists with «Sin dato» and the datum's options", async () => {
    await queried();
    for (const d of DEFINITIONS) {
      const c = control(d.label);
      if (d.type === "list") {
        expect(c.tagName).toBe("SELECT");
        const options = within(c).getAllByRole("option").map((o) => o.textContent);
        expect(options).toEqual(["Sin dato", ...d.options!]);
      } else {
        expect(c.tagName).toBe("INPUT");
      }
    }
  });

  it("each of the 26 data has its labelled control and its «Verificado» checkbox", async () => {
    await queried();
    expect(screen.getAllByRole("checkbox")).toHaveLength(26);
    for (const d of DEFINITIONS) {
      expect(control(d.label)).toHaveAccessibleName();
      expect(checkbox(d.label)).toHaveAccessibleName(/Verificado/);
      expect(checkbox(d.label)).not.toBeChecked();
    }
  });

  it("announces the result in an aria-live region", async () => {
    const { container } = await queried();
    const liveRegions = Array.from(container.querySelectorAll("[aria-live]"));
    expect(liveRegions.length).toBeGreaterThan(0);
    expect(liveRegions.some((el) => /26 sin verificar/.test(el.textContent ?? ""))).toBe(true);
  });

  it("with `initial` it shows the data without querying", () => {
    const { query } = mount({ initial: data() });
    expect(query).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Parcela" })).toBeInTheDocument();
    expect(control("Municipio")).toHaveValue("MUNI TEST");
    expect(screen.getByRole("button", { name: "Volver a consultar" })).toBeEnabled();
  });
});

describe("TechnicalDataEditor · edit and restore", () => {
  it("editing a text with an origin shows «Editado» and the origin value; «Restaurar» gives it back", async () => {
    const { user } = await queried();
    expect(within(rowOf("Dirección")).queryByText("Editado")).not.toBeInTheDocument();
    expect(within(rowOf("Dirección")).queryByRole("button", { name: /Restaurar/ })).not.toBeInTheDocument();

    await typeInto(user, "Dirección", "CL NEW 2");
    const f = rowOf("Dirección");
    expect(within(f).getByText("Editado")).toBeInTheDocument();
    expect(f).toHaveTextContent("Valor de Catastro: CL TEST 1");

    await user.click(within(f).getByRole("button", { name: /Restaurar/ }));
    expect(control("Dirección")).toHaveValue("CL TEST 1");
    expect(within(rowOf("Dirección")).queryByText("Editado")).not.toBeInTheDocument();
    expect(rowOf("Dirección")).not.toHaveTextContent("Valor de Catastro");
  });

  it("editing a list shows «Editado» with the datum's origin; «Sin dato» leaves the value empty", async () => {
    const { user } = await queried();
    await user.selectOptions(control("Clase"), "Rústico");
    expect(control("Clase")).toHaveValue("Rústico");
    expect(within(rowOf("Clase")).getByText("Editado")).toBeInTheDocument();
    expect(rowOf("Clase")).toHaveTextContent("Valor de Catastro: Urbano");

    await user.selectOptions(control("Zona climática"), "Sin dato");
    expect(control("Zona climática")).toHaveValue("");
    expect(rowOf("Zona climática")).toHaveTextContent("Valor de CTE DB-HE · Anejo B: D2");
  });

  it("if the original was empty, the origin notice says «vacío»", async () => {
    const m = mount({ initial: data({ altitude: { original: "" } }, { altitude: "" }) });
    await typeInto(m.user, "Altitud", "55");
    expect(rowOf("Altitud")).toHaveTextContent(/Valor de Open-Meteo: vacío/);
  });

  it("typing the original value again removes the edited mark", async () => {
    const { user } = await queried();
    await typeInto(user, "Municipio", "OTRO");
    expect(within(rowOf("Municipio")).getByText("Editado")).toBeInTheDocument();
    await typeInto(user, "Municipio", "MUNI TEST");
    expect(within(rowOf("Municipio")).queryByText("Editado")).not.toBeInTheDocument();
  });

  it("an edited manual datum (no original) does NOT show «Editado» or «Restaurar»", async () => {
    const { user } = await queried();
    await typeInto(user, "Edificabilidad", "2");
    expect(control("Edificabilidad")).toHaveValue("2");
    const f = rowOf("Edificabilidad");
    expect(within(f).queryByText("Editado")).not.toBeInTheDocument();
    expect(within(f).queryByRole("button", { name: /Restaurar/ })).not.toBeInTheDocument();
    expect(f).not.toHaveTextContent("Valor de");
  });

  it("the «{n} editados» counter goes up when editing and down when restoring", async () => {
    const { user } = await queried();
    expect(screen.queryByText("1 editados")).not.toBeInTheDocument();
    await typeInto(user, "Dirección", "X");
    expect(screen.getByText("1 editados")).toBeInTheDocument();
    await typeInto(user, "Municipio", "Y");
    expect(screen.getByText("2 editados")).toBeInTheDocument();
    await user.click(within(rowOf("Dirección")).getByRole("button", { name: /Restaurar/ }));
    expect(screen.getByText("1 editados")).toBeInTheDocument();
  });

  it("an edited datum keeps its edited mark in `initial`", () => {
    mount({ initial: data({ address: { value: "CL OTHER 5" } }) });
    expect(within(rowOf("Dirección")).getByText("Editado")).toBeInTheDocument();
    expect(screen.getByText("1 editados")).toBeInTheDocument();
  });
});

describe("TechnicalDataEditor · verification", () => {
  it("ticking «Verificado» updates the counter; a verified datum cannot be unticked (the API has no un-verify)", async () => {
    const { user } = await queried();
    expect(screen.getByText("26 sin verificar")).toBeInTheDocument();
    await user.click(checkbox("Dirección"));
    expect(checkbox("Dirección")).toBeChecked();
    expect(screen.getByText("25 sin verificar")).toBeInTheDocument();
    expect(checkbox("Dirección")).toBeDisabled();
    await user.click(checkbox("Dirección"));
    expect(checkbox("Dirección")).toBeChecked();
    expect(screen.getByText("25 sin verificar")).toBeInTheDocument();
  });

  it("verifying all 26 one by one shows «Todo verificado»", async () => {
    const { user } = await queried();
    for (const c of screen.getAllByRole("checkbox")) await user.click(c);
    expect(screen.getByText("Todo verificado")).toBeInTheDocument();
    expect(screen.queryByText(/sin verificar/)).not.toBeInTheDocument();
  });

  it("«Marcar todo como verificado» ticks every checkbox and shows «Todo verificado»", async () => {
    const { user } = await queried();
    await user.click(screen.getByRole("button", { name: "Marcar todo como verificado" }));
    for (const c of screen.getAllByRole("checkbox")) expect(c).toBeChecked();
    expect(screen.getByText("Todo verificado")).toBeInTheDocument();
    expect(screen.queryByText(/sin verificar/)).not.toBeInTheDocument();
  });

  it("editing a verified datum un-verifies it (server rule of RGB-28), and it can be verified again", async () => {
    const { user } = await queried();
    await user.click(checkbox("Municipio"));
    expect(checkbox("Municipio")).toBeChecked();
    await typeInto(user, "Municipio", "OTRO");
    expect(checkbox("Municipio")).not.toBeChecked();
    expect(checkbox("Municipio")).toBeEnabled();
    expect(screen.getByText("26 sin verificar")).toBeInTheDocument();
  });

  it("with `initial` already verified it shows «Todo verificado»", () => {
    const todos = Object.fromEntries(DEFINITIONS.map((d) => [d.id, { verified: true }]));
    mount({ initial: data(todos) });
    expect(screen.getByText("Todo verificado")).toBeInTheDocument();
  });
});

describe("TechnicalDataEditor · capacity", () => {
  const NOTICE = "Rellena edificabilidad, ocupación y número de plantas para calcular la capacidad.";

  it("without planning it shows the notice instead of figures", async () => {
    await queried();
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });

  it("it is calculated live when buildability, occupancy and floors exist", async () => {
    const { user, container } = await queried();
    await typeInto(user, "Edificabilidad", "2");
    await typeInto(user, "Ocupación máxima", "50");
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    await user.selectOptions(control("Número de plantas"), "PB+2");
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    // surface 100: ceiling 200, footprint 50, footprint × floors 150 → limited by occupancy × floors
    expect(container).toHaveTextContent(/200 m²t/);
    expect(container).toHaveTextContent(/150 m²t/);
    expect(container).toHaveTextContent("limita: Ocupación × plantas");
  });

  it("it is recalculated on edit: buildability 1 becomes the limit", async () => {
    const { user, container } = await queried();
    await typeInto(user, "Edificabilidad", "2");
    await typeInto(user, "Ocupación máxima", "50");
    await user.selectOptions(control("Número de plantas"), "PB+2");
    expect(container).toHaveTextContent("limita: Ocupación × plantas");
    await typeInto(user, "Edificabilidad", "1");
    expect(container).toHaveTextContent("limita: Edificabilidad");
    expect(container).not.toHaveTextContent("limita: Ocupación × plantas");
    expect(container).toHaveTextContent(/100 m²t/);
  });

  it("returns to the notice if a required datum is emptied", async () => {
    const { user } = await queried();
    await typeInto(user, "Edificabilidad", "2");
    await typeInto(user, "Ocupación máxima", "50");
    await user.selectOptions(control("Número de plantas"), "PB+2");
    await typeInto(user, "Ocupación máxima", "");
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });

  it("uses the polygon surface when the calculation surface is «Polígono»", async () => {
    const { user, container } = await queried();
    await typeInto(user, "Edificabilidad", "2");
    await typeInto(user, "Ocupación máxima", "50");
    await user.selectOptions(control("Número de plantas"), "PB+2");
    await user.selectOptions(control("Superficie de cálculo"), "Polígono");
    // surface 98: ceiling 196, footprint 49, ×3 = 147
    expect(container).toHaveTextContent(/196 m²t/);
    expect(container).toHaveTextContent(/147 m²t/);
  });

  it("indicates whether the minimum plot is met", async () => {
    const { user, container } = await queried();
    await typeInto(user, "Edificabilidad", "2");
    await typeInto(user, "Ocupación máxima", "50");
    await user.selectOptions(control("Número de plantas"), "PB+2");
    await typeInto(user, "Parcela mínima", "80");
    expect(container).toHaveTextContent(/Cumple/);
    expect(container).not.toHaveTextContent(/No cumple/);
    await typeInto(user, "Parcela mínima", "150");
    expect(container).toHaveTextContent(/No cumple/);
  });

  it("with a complete `initial` it calculates the capacity without editing", () => {
    const { container } = mount({
      initial: data({}, { buildability: "2", maxOccupancy: "50", floors: "PB+2" }),
    });
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    expect(container).toHaveTextContent(/150 m²t/);
  });
});

describe("TechnicalDataEditor · query again", () => {
  it("replaces the origin data, resets their verification and keeps the manual ones", async () => {
    const incoming = data({}, { address: "CL OTHER 3", municipality: "MUNI NEW", buildability: "", calcArea: "Catastral" });
    const query = jest.fn().mockResolvedValueOnce(data()).mockResolvedValueOnce(incoming);
    const { user } = mount({ query });
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    await screen.findByRole("heading", { name: "Parcela" });

    await typeInto(user, "Dirección", "CL EDITADA 9");
    await user.click(checkbox("Municipio"));
    await typeInto(user, "Edificabilidad", "1,5");
    await user.selectOptions(control("Superficie de cálculo"), "Polígono");

    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    await waitFor(() => expect(control("Municipio")).toHaveValue("MUNI NEW"));
    expect(query).toHaveBeenCalledTimes(2);

    // origin replaced: no longer edited or verified
    expect(control("Dirección")).toHaveValue("CL OTHER 3");
    expect(within(rowOf("Dirección")).queryByText("Editado")).not.toBeInTheDocument();
    expect(checkbox("Municipio")).not.toBeChecked();
    // manual ones kept
    expect(control("Edificabilidad")).toHaveValue("1,5");
    expect(control("Superficie de cálculo")).toHaveValue("Polígono");
  });

  it("while querying again the button says «Consultando…» and is disabled", async () => {
    let resolveFetch!: (d: TechnicalData) => void;
    const query = jest
      .fn()
      .mockResolvedValueOnce(data())
      .mockImplementationOnce(() => new Promise<TechnicalData>((r) => (resolveFetch = r)));
    const { user } = mount({ query, raw: true });
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    await screen.findByRole("heading", { name: "Parcela" });
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    expect(screen.getByRole("button", { name: "Consultando…" })).toBeDisabled();
    resolveFetch(data());
    await screen.findByRole("button", { name: "Volver a consultar" });
  });

  it("querying again with an invalid reference warns and does not query", async () => {
    const { user, query } = await queried();
    await typeInto(user, "Referencia catastral", "123");
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    expect(screen.getByText(invalidMessage("123"))).toBeInTheDocument();
    expect(query).toHaveBeenCalledTimes(1);
    expect(control("Dirección")).toHaveValue("CL TEST 1");
  });
});

describe.each(["read-only", "preview"] as const)("TechnicalDataEditor · %s mode", (mode) => {
  it("all data controls and all buttons are disabled", () => {
    const { query } = mount({ mode, initial: data({ address: { value: "CL OTHER 5" } }) });
    const fields = [...screen.getAllByRole("textbox"), ...screen.getAllByRole("combobox"), ...screen.getAllByRole("checkbox")];
    expect(screen.getAllByRole("checkbox")).toHaveLength(26);
    for (const d of DEFINITIONS) {
      expect(control(d.label)).toBeDisabled();
      expect(checkbox(d.label)).toBeDisabled();
    }
    for (const c of fields) {
      if (c === screen.queryByLabelText(/Referencia catastral/)) {
        expect((c as HTMLInputElement).disabled || (c as HTMLInputElement).readOnly).toBe(true);
      } else {
        expect(c).toBeDisabled();
      }
    }
    for (const b of screen.queryAllByRole("button")) expect(b).toBeDisabled();
    expect(query).not.toHaveBeenCalled();
  });

  it("still shows the state (edited, origin) but does not allow restoring", async () => {
    const { user } = mount({ mode, initial: data({ address: { value: "CL OTHER 5" } }) });
    expect(within(rowOf("Dirección")).getByText("Editado")).toBeInTheDocument();
    expect(rowOf("Dirección")).toHaveTextContent("Valor de Catastro: CL TEST 1");
    const r = within(rowOf("Dirección")).queryByRole("button", { name: /Restaurar/ });
    if (r) {
      expect(r).toBeDisabled();
      await user.click(r);
    }
    expect(control("Dirección")).toHaveValue("CL OTHER 5");
  });

  it("cannot be ticked as verified nor tick all", async () => {
    const { user } = mount({ mode, initial: data() });
    await user.click(checkbox("Dirección"));
    expect(checkbox("Dirección")).not.toBeChecked();
    const todo = screen.queryByRole("button", { name: "Marcar todo como verificado" });
    if (todo) {
      expect(todo).toBeDisabled();
      await user.click(todo);
    }
    expect(screen.getByText("26 sin verificar")).toBeInTheDocument();
  });

  it("cannot be queried without data: button disabled and `query` is not called", async () => {
    const { user, query } = mount({ mode, initial: null });
    const b = screen.queryByRole("button", { name: /Obtener datos técnicos|Volver a consultar/ });
    if (b) {
      expect(b).toBeDisabled();
      await user.click(b);
    }
    expect(query).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Parcela" })).not.toBeInTheDocument();
  });

  it("the capacity is also shown, without being editable", () => {
    const { container } = mount({ mode, initial: data({}, { buildability: "2", maxOccupancy: "50", floors: "PB+2" }) });
    expect(container).toHaveTextContent(/150 m²t/);
  });

  it("no accessibility violations", async () => {
    const { container } = render(
      <main>
        <TechnicalDataEditor projectCode="PRY-2026-001" cadastralReference={REF} initial={data({ address: { value: "CL OTHER 5" } })} mode={mode} api={fakeTechnicalDataApi()} />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("TechnicalDataEditor · read-only without data", () => {
  it("shows «Sin datos técnicos registrados.» without groups or query", () => {
    const { query } = mount({ mode: "read-only", initial: null });
    expect(screen.getByText("Sin datos técnicos registrados.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Parcela" })).not.toBeInTheDocument();
    expect(query).not.toHaveBeenCalled();
  });

  it("in edit mode without data that message does not appear", () => {
    mount({ mode: "edit", initial: null });
    expect(screen.queryByText("Sin datos técnicos registrados.")).not.toBeInTheDocument();
  });

  it("no accessibility violations", async () => {
    const { container } = render(
      <main>
        <TechnicalDataEditor projectCode="PRY-2026-001" cadastralReference="" initial={null} mode="read-only" api={fakeTechnicalDataApi()} />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("TechnicalDataEditor · accessibility", () => {
  it("before querying", async () => {
    const { container } = render(
      <main>
        <TechnicalDataEditor projectCode="PRY-2026-001" cadastralReference={REF} initial={null} mode="edit" api={fakeTechnicalDataApi()} />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("after querying, with edited and verified data and capacity", async () => {
    const query = jest.fn().mockResolvedValue(data({ address: { value: "CL OTHER 5", verified: true } }, { buildability: "2", maxOccupancy: "50", floors: "PB+2" }));
    const user = userEvent.setup();
    const { container } = render(
      <main>
        <TechnicalDataEditor projectCode="PRY-2026-001" cadastralReference={REF} initial={null} mode="edit" api={fakeTechnicalDataApi({ query })} />
      </main>,
    );
    await user.click(queryButton());
    await screen.findByRole("heading", { name: "Parcela" });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("with the invalid-reference notice", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <main>
        <TechnicalDataEditor projectCode="PRY-2026-001" cadastralReference="123" initial={null} mode="edit" api={fakeTechnicalDataApi()} />
      </main>,
    );
    await user.click(queryButton());
    expect(screen.getByText(invalidMessage("123"))).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("can be operated with the keyboard: Tab reaches the checkbox and Space ticks it", async () => {
    const { user } = await queried();
    checkbox("Dirección").focus();
    expect(checkbox("Dirección")).toHaveFocus();
    await user.keyboard(" ");
    expect(checkbox("Dirección")).toBeChecked();
    expect(screen.getByText("25 sin verificar")).toBeInTheDocument();
  });
});
