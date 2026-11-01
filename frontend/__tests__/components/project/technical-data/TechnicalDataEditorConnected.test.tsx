/**
 * RGB-51 · contract of the connected `<TechnicalDataEditor>`:
 *   props: {
 *     projectCode: string;                 // NEW, required
 *     cadastralReference: string;          // prefill; if empty, the reference of the loaded sheet is used
 *     initial?: TechnicalData | null;      // undefined => the editor LOADS (api.load); null/data => used as is, no load
 *     mode: PhaseMode;
 *     api?: TechnicalDataApi;              // default technicalDataApiFor(projectCode); replaces the old `query` prop
 *   }
 *  - text/number inputs are saved on blur (or Enter) when changed; selects and checkboxes on change. No optimistic state:
 *    the screen paints what the API returns.
 *  - While a datum request is pending its row shows «Guardando…» and its controls are disabled; «Marcar todo como
 *    verificado» (label «Verificando…» while pending) and the query button are disabled while ANY request is pending.
 *  - 422 (and any other non-403/409/404 error) on a datum: message in the row (role="alert", aria-describedby, aria-invalid).
 *    403, 409: general alert on top (focused) and the whole screen turns read-only. 404: general alert (focused), still editable.
 *  - Query: invalid reference -> validateCadastralReference message, no call; 503 -> server message + «Introducir datos
 *    manualmente» (if there is no data); `unmapped` ids -> warning with their labels.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { TechnicalDataEditor } from "@/components/project/technical-data/TechnicalDataEditor";
import { ApiError } from "@/lib/api";
import { DEFINITIONS, type TechnicalData, type TechnicalDatum } from "@/lib/technical-data";
import type { TechnicalDataApi } from "@/lib/technical-data-api";
import { apiSheetJson, emptyCatalog, fakeTechnicalDataApi, reply } from "../../../helpers/technical-data-fake-api";

jest.setTimeout(30000);

const REF = "1234567DG3413S0001AB";
const CODE = "PRY-2026-001";

function sheet(overrides: Record<string, Partial<TechnicalDatum>> = {}, extra: Partial<TechnicalData> = {}): TechnicalData {
  const data = emptyCatalog().map((d) => {
    const def = DEFINITIONS.find((x) => x.id === d.id)!;
    return { ...d, original: def.group === "planning" ? null : "", ...overrides[d.id] };
  });
  return { cadastralReference: REF, queriedOn: "2026-10-18", data, ...extra };
}
const FILLED = sheet({
  address: { value: "CL TEST 1", original: "CL TEST 1" },
  municipality: { value: "MUNI TEST", original: "MUNI TEST" },
  propertyClass: { value: "Urbano", original: "Urbano" },
  builtArea: { value: "100", original: "100" },
});

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const control = (label: string) => screen.getByLabelText(new RegExp(`^${escapeRegex(label)}`));
function rowOf(label: string): HTMLElement {
  let el: HTMLElement | null = control(label).parentElement;
  while (el && !el.querySelector('input[type="checkbox"]')) el = el.parentElement;
  if (!el) throw new Error("row not found");
  return el;
}
const checkbox = (label: string) => within(rowOf(label)).getByRole("checkbox");
const apiError = (status: number, code: string, message: string) => new ApiError(status, code, message);

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mount(props: Partial<React.ComponentProps<typeof TechnicalDataEditor>> & { api?: TechnicalDataApi } = {}) {
  const api = props.api ?? fakeTechnicalDataApi({ initial: FILLED });
  const user = userEvent.setup();
  const r = render(
    <main>
      <TechnicalDataEditor projectCode={CODE} cadastralReference={REF} initial={FILLED} mode="edit" {...props} api={api} />
    </main>,
  );
  return { user, api: api as ReturnType<typeof fakeTechnicalDataApi>, ...r };
}

/** Read-only means: every datum control, every checkbox and every button is disabled. */
function expectReadOnly() {
  for (const d of DEFINITIONS) {
    expect(control(d.label)).toBeDisabled();
    expect(checkbox(d.label)).toBeDisabled();
  }
  expect(screen.getByLabelText(/Referencia catastral/)).toBeDisabled();
  for (const b of screen.getAllByRole("button")) expect(b).toBeDisabled();
}

describe("loading", () => {
  it("without `initial` the editor loads the sheet of the project from the API and paints it", async () => {
    const d = deferred<TechnicalData>();
    const api = fakeTechnicalDataApi();
    api.load.mockReturnValue(d.promise);
    render(<TechnicalDataEditor projectCode={CODE} cadastralReference="" mode="edit" api={api} />);
    expect(screen.getByText("Cargando datos técnicos…")).toBeInTheDocument();
    expect(api.load).toHaveBeenCalledTimes(1);
    expect(api.load).toHaveBeenCalledWith(CODE);
    d.resolve(FILLED);
    expect(await screen.findByDisplayValue("CL TEST 1")).toBeInTheDocument();
    expect(screen.queryByText("Cargando datos técnicos…")).not.toBeInTheDocument();
    expect(screen.getByText(/Consultado el 18 oct 2026/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volver a consultar" })).toBeEnabled();
  });

  it("prefills the reference of the loaded sheet when the prop is empty", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    render(<TechnicalDataEditor projectCode={CODE} cadastralReference="" mode="edit" api={api} />);
    await screen.findByDisplayValue("CL TEST 1");
    expect(screen.getByLabelText(/Referencia catastral/)).toHaveValue(REF);
  });

  it("a catalog never queried and never edited shows the pre-query state", async () => {
    const api = fakeTechnicalDataApi({ initial: sheet({}, { queriedOn: null, cadastralReference: "" }) });
    render(<TechnicalDataEditor projectCode={CODE} cadastralReference={REF} mode="edit" api={api} />);
    expect(await screen.findByRole("button", { name: "Obtener datos técnicos" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "Parcela" })).not.toBeInTheDocument();
    expect(screen.queryByText("Cargando datos técnicos…")).not.toBeInTheDocument();
  });

  it("data entered by hand without any query are shown (button «Volver a consultar»)", async () => {
    const api = fakeTechnicalDataApi({ initial: sheet({ buildability: { value: "2" } }, { queriedOn: null, cadastralReference: "" }) });
    render(<TechnicalDataEditor projectCode={CODE} cadastralReference={REF} mode="edit" api={api} />);
    expect(await screen.findByLabelText(/^Edificabilidad/)).toHaveValue("2");
    expect(screen.getByRole("button", { name: "Volver a consultar" })).toBeEnabled();
    expect(screen.queryByText(/Consultado el/)).not.toBeInTheDocument();
  });

  it("a never-queried catalog in read-only mode says there is nothing", async () => {
    const api = fakeTechnicalDataApi({ initial: sheet({}, { queriedOn: null, cadastralReference: "" }) });
    render(<TechnicalDataEditor projectCode={CODE} cadastralReference="" mode="read-only" api={api} />);
    expect(await screen.findByText("Sin datos técnicos registrados.")).toBeInTheDocument();
  });

  it("a load failure shows the server message in an alert and no controls", async () => {
    const api = fakeTechnicalDataApi();
    api.load.mockRejectedValue(apiError(404, "project_not_found", "No existe el proyecto PRY-2026-001."));
    render(<TechnicalDataEditor projectCode={CODE} cadastralReference="" mode="edit" api={api} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No existe el proyecto PRY-2026-001.");
    expect(screen.queryByRole("heading", { name: "Parcela" })).not.toBeInTheDocument();
    expect(screen.queryByText("Cargando datos técnicos…")).not.toBeInTheDocument();
  });

  it("with `initial` given (data or null) it does not load", () => {
    const { api } = mount({ initial: FILLED });
    expect(api.load).not.toHaveBeenCalled();
    mount({ initial: null });
  });
});

describe("default api by project", () => {
  let original: typeof fetch;
  let calls: string[];
  beforeEach(() => {
    original = globalThis.fetch;
    calls = [];
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      return reply(200, apiSheetJson({ address: { value: "CL REAL 1", original: "CL REAL 1" } }));
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = original;
  });

  it("a real project loads from GET /api/projects/{code}/technical-data", async () => {
    render(<TechnicalDataEditor projectCode={CODE} cadastralReference="" mode="edit" />);
    expect(await screen.findByDisplayValue("CL REAL 1")).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/\/api\/projects\/PRY-2026-001\/technical-data$/);
  });

  it("PRY-EJ-001 loads the sample data and never calls the network", async () => {
    render(<TechnicalDataEditor projectCode="PRY-EJ-001" cadastralReference="" mode="edit" />);
    expect(await screen.findByDisplayValue("CL EJEMPLO 12")).toBeInTheDocument();
    expect(screen.getByText("2 editados")).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("PRY-EJ-004 starts in the pre-query state and a sample edit stays local", async () => {
    const user = userEvent.setup();
    render(<TechnicalDataEditor projectCode="PRY-EJ-004" cadastralReference={REF} mode="edit" />);
    await user.click(await screen.findByRole("button", { name: "Obtener datos técnicos" }));
    await screen.findByRole("heading", { name: "Parcela" });
    await user.type(control("Edificabilidad"), "2");
    await user.tab();
    await waitFor(() => expect(control("Edificabilidad")).toHaveValue("2"));
    expect(calls).toEqual([]);
  });
});

describe("editing a datum", () => {
  it("a text is saved once, on blur, with the typed value (not per keystroke)", async () => {
    const { user, api } = mount();
    const field = control("Dirección");
    await user.clear(field);
    await user.type(field, "CL NEW 2");
    expect(api.edit).not.toHaveBeenCalled();
    await user.tab();
    await waitFor(() => expect(api.edit).toHaveBeenCalledTimes(1));
    expect(api.edit).toHaveBeenCalledWith(CODE, "address", "CL NEW 2");
    await waitFor(() => expect(within(rowOf("Dirección")).getByText("Editado")).toBeInTheDocument());
  });

  it("Enter also saves", async () => {
    const { user, api } = mount();
    await user.clear(control("Municipio"));
    await user.type(control("Municipio"), "OTRO{Enter}");
    await waitFor(() => expect(api.edit).toHaveBeenCalledWith(CODE, "municipality", "OTRO"));
  });

  it("leaving a field without changing it does not call the API", async () => {
    const { user, api } = mount();
    await user.click(control("Dirección"));
    await user.tab();
    expect(api.edit).not.toHaveBeenCalled();
  });

  it("a list is saved on change; «Sin dato» sends an empty string", async () => {
    const { user, api } = mount();
    await user.selectOptions(control("Clase"), "Rústico");
    await waitFor(() => expect(api.edit).toHaveBeenCalledWith(CODE, "propertyClass", "Rústico"));
    await user.selectOptions(control("Clase"), "Sin dato");
    await waitFor(() => expect(api.edit).toHaveBeenLastCalledWith(CODE, "propertyClass", ""));
  });

  it("paints what the server answers, not what was typed (no optimistic state)", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.edit.mockResolvedValue({ id: "address", value: "CL NORMALIZED", original: "CL TEST 1", verified: false, edited: true });
    const { user } = mount({ api });
    await user.clear(control("Dirección"));
    await user.type(control("Dirección"), "  cl typed ");
    await user.tab();
    await waitFor(() => expect(control("Dirección")).toHaveValue("CL NORMALIZED"));
    expect(within(rowOf("Dirección")).getByText("Editado")).toBeInTheDocument();
    expect(rowOf("Dirección")).toHaveTextContent("Valor de Catastro: CL TEST 1");
  });

  it("while saving: the row says «Guardando…», its controls are disabled and the global buttons too", async () => {
    const d = deferred<TechnicalDatum>();
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.edit.mockReturnValue(d.promise);
    const { user } = mount({ api });
    await user.selectOptions(control("Clase"), "Rústico");
    const row = rowOf("Clase");
    expect(within(row).getByText("Guardando…")).toBeInTheDocument();
    expect(control("Clase")).toBeDisabled();
    expect(checkbox("Clase")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Marcar todo como verificado" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Volver a consultar" })).toBeDisabled();
    // the server has not answered: nothing is marked as edited yet
    expect(within(row).queryByText("Editado")).not.toBeInTheDocument();
    expect(screen.queryByText("1 editados")).not.toBeInTheDocument();
    d.resolve({ id: "propertyClass", value: "Rústico", original: "Urbano", verified: false, edited: true });
    await waitFor(() => expect(within(rowOf("Clase")).queryByText("Guardando…")).not.toBeInTheDocument());
    expect(control("Clase")).toBeEnabled();
    expect(within(rowOf("Clase")).getByText("Editado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marcar todo como verificado" })).toBeEnabled();
  });

  it("only the saving datum is marked «Guardando…»", async () => {
    const d = deferred<TechnicalDatum>();
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.edit.mockReturnValue(d.promise);
    const { user } = mount({ api });
    await user.selectOptions(control("Clase"), "Rústico");
    expect(screen.getAllByText("Guardando…")).toHaveLength(1);
    expect(control("Dirección")).toBeEnabled();
    d.resolve({ id: "propertyClass", value: "Rústico", original: "Urbano", verified: false, edited: true });
    await waitFor(() => expect(screen.queryByText("Guardando…")).not.toBeInTheDocument());
  });
});

describe("restore and verify", () => {
  const EDITED = sheet({ address: { value: "CL OTHER", original: "CL TEST 1", edited: true } });

  it("«Restaurar» calls the API and paints the returned datum", async () => {
    const api = fakeTechnicalDataApi({ initial: EDITED });
    const { user } = mount({ api, initial: EDITED });
    await user.click(within(rowOf("Dirección")).getByRole("button", { name: /Restaurar/ }));
    await waitFor(() => expect(api.restore).toHaveBeenCalledWith(CODE, "address"));
    await waitFor(() => expect(control("Dirección")).toHaveValue("CL TEST 1"));
    expect(within(rowOf("Dirección")).queryByText("Editado")).not.toBeInTheDocument();
  });

  it("while restoring, «Restaurar» is disabled and the row says «Guardando…»", async () => {
    const d = deferred<TechnicalDatum>();
    const api = fakeTechnicalDataApi({ initial: EDITED });
    api.restore.mockReturnValue(d.promise);
    const { user } = mount({ api, initial: EDITED });
    await user.click(within(rowOf("Dirección")).getByRole("button", { name: /Restaurar/ }));
    expect(within(rowOf("Dirección")).getByRole("button", { name: /Restaurar/ })).toBeDisabled();
    expect(within(rowOf("Dirección")).getByText("Guardando…")).toBeInTheDocument();
    expect(control("Dirección")).toHaveValue("CL OTHER");
    d.resolve({ id: "address", value: "CL TEST 1", original: "CL TEST 1", verified: false, edited: false });
    await waitFor(() => expect(control("Dirección")).toHaveValue("CL TEST 1"));
  });

  it("ticking «Verificado» calls verify and paints the datum as the server returns it", async () => {
    const { user, api } = mount();
    await user.click(checkbox("Municipio"));
    expect(api.verify).toHaveBeenCalledWith(CODE, "municipality");
    await waitFor(() => expect(checkbox("Municipio")).toBeChecked());
    expect(checkbox("Municipio")).toBeDisabled();
    expect(screen.getByText("25 sin verificar")).toBeInTheDocument();
  });

  it("the checkbox is not ticked until the server answers", async () => {
    const d = deferred<TechnicalDatum>();
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.verify.mockReturnValue(d.promise);
    const { user } = mount({ api });
    await user.click(checkbox("Municipio"));
    expect(checkbox("Municipio")).not.toBeChecked();
    expect(checkbox("Municipio")).toBeDisabled();
    expect(within(rowOf("Municipio")).getByText("Guardando…")).toBeInTheDocument();
    d.resolve({ id: "municipality", value: "MUNI TEST", original: "MUNI TEST", verified: true, edited: false });
    await waitFor(() => expect(checkbox("Municipio")).toBeChecked());
  });

  it("«Marcar todo como verificado» calls verifyAll, shows «Verificando…» and paints the returned sheet", async () => {
    const d = deferred<TechnicalData>();
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.verifyAll.mockReturnValue(d.promise);
    const { user } = mount({ api });
    await user.click(screen.getByRole("button", { name: "Marcar todo como verificado" }));
    expect(api.verifyAll).toHaveBeenCalledWith(CODE);
    expect(screen.getByRole("button", { name: "Verificando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Volver a consultar" })).toBeDisabled();
    // the server verifies everything but the buildability: that is what must be painted
    d.resolve({ ...FILLED, data: FILLED.data.map((x) => ({ ...x, verified: x.id !== "buildability" })) });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Verificando…" })).not.toBeInTheDocument());
    expect(checkbox("Dirección")).toBeChecked();
    expect(checkbox("Edificabilidad")).not.toBeChecked();
    expect(screen.getByText("1 sin verificar")).toBeInTheDocument();
  });
});

describe("query (refresh from the Catastro)", () => {
  it("calls refresh with the project code and the reference, shows «Consultando…» and paints exactly what the server returns", async () => {
    const d = deferred<TechnicalData & { unmapped: string[] }>();
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.refresh.mockReturnValue(d.promise);
    const { user } = mount({ api });
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    expect(api.refresh).toHaveBeenCalledWith(CODE, REF);
    expect(screen.getByRole("button", { name: "Consultando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Marcar todo como verificado" })).toBeDisabled();
    // no client-side merge: the server decides what is kept
    d.resolve({
      ...sheet({ address: { value: "CL SERVER 7", original: "CL SERVER 7" }, buildability: { value: "9" } }, { queriedOn: "2026-11-02" }),
      unmapped: [],
    });
    await waitFor(() => expect(control("Dirección")).toHaveValue("CL SERVER 7"));
    expect(control("Edificabilidad")).toHaveValue("9");
    expect(screen.getByText(/Consultado el 2 nov 2026/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Consultando…" })).not.toBeInTheDocument();
  });

  it("the first query of a never-queried project goes through the API too", async () => {
    const api = fakeTechnicalDataApi();
    api.refresh.mockResolvedValue({ ...FILLED, unmapped: [] });
    const { user } = mount({ api, initial: null });
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    expect(await screen.findByRole("heading", { name: "Parcela" })).toBeInTheDocument();
    expect(api.refresh).toHaveBeenCalledWith(CODE, REF);
    expect(control("Dirección")).toHaveValue("CL TEST 1");
  });

  it("an invalid reference shows the RGB-18 message, marks the field and does not call the API", async () => {
    const { user, api } = mount({ initial: null });
    const field = screen.getByLabelText(/Referencia catastral/);
    await user.clear(field);
    await user.type(field, "123");
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    expect(screen.getByText("La referencia catastral tiene 20 caracteres (14 de la parcela y 6 del inmueble) y has escrito 3.")).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(api.refresh).not.toHaveBeenCalled();
  });

  it("a plot-only reference (14 characters) gets its specific message", async () => {
    const { user, api } = mount({ initial: null });
    const field = screen.getByLabelText(/Referencia catastral/);
    await user.clear(field);
    await user.type(field, REF.slice(0, 14));
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    expect(screen.getByText(/es la referencia de la parcela/)).toBeInTheDocument();
    expect(api.refresh).not.toHaveBeenCalled();
  });

  it("warns of the data the Catastro could not map, by label, and the warning disappears on the next query", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.refresh.mockResolvedValueOnce({ ...FILLED, unmapped: ["use", "year"] }).mockResolvedValueOnce({ ...FILLED, unmapped: [] });
    const { user } = mount({ api });
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    const warning = await screen.findByText(/No se pudieron rellenar/);
    expect(warning).toHaveTextContent(/Uso catastral/);
    expect(warning).toHaveTextContent(/Año de construcción/);
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    await waitFor(() => expect(screen.queryByText(/No se pudieron rellenar/)).not.toBeInTheDocument());
  });

  it("with nothing unmapped there is no warning", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.refresh.mockResolvedValue({ ...FILLED, unmapped: [] });
    const { user } = mount({ api });
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    await waitFor(() => expect(api.refresh).toHaveBeenCalled());
    expect(screen.queryByText(/No se pudieron rellenar/)).not.toBeInTheDocument();
  });
});

describe("errors from the server", () => {
  it("422 on an edit: the message is next to the datum, the field is invalid and described by it, the draft stays", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.edit.mockRejectedValue(apiError(422, "invalid_value", "El año debe ser un número."));
    const { user } = mount({ api });
    await user.clear(control("Año de construcción"));
    await user.type(control("Año de construcción"), "abc");
    await user.tab();
    const alert = await within(rowOf("Año de construcción")).findByRole("alert");
    expect(alert).toHaveTextContent("El año debe ser un número.");
    const field = control("Año de construcción");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field.getAttribute("aria-describedby")).toContain(alert.id);
    expect(field).toHaveValue("abc");
    // the rest of the screen is still usable, and the stored data did not change
    expect(control("Dirección")).toBeEnabled();
    expect(screen.queryByText("1 editados")).not.toBeInTheDocument();
  });

  it("the datum error goes away when the person edits it again", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.edit.mockRejectedValueOnce(apiError(422, "invalid_value", "El año debe ser un número."));
    const { user } = mount({ api });
    await user.clear(control("Año de construcción"));
    await user.type(control("Año de construcción"), "abc");
    await user.tab();
    await within(rowOf("Año de construcción")).findByRole("alert");
    await user.clear(control("Año de construcción"));
    await user.type(control("Año de construcción"), "1990");
    await waitFor(() => expect(within(rowOf("Año de construcción")).queryByRole("alert")).not.toBeInTheDocument());
  });

  it("a network failure (plain Error) on a datum shows a generic message next to it", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.verify.mockRejectedValue(new Error("boom"));
    const { user } = mount({ api });
    await user.click(checkbox("Municipio"));
    expect(await within(rowOf("Municipio")).findByRole("alert")).toHaveTextContent("No se pudo guardar. Inténtalo de nuevo.");
    expect(checkbox("Municipio")).toBeEnabled();
    expect(checkbox("Municipio")).not.toBeChecked();
  });

  it("a server error (500) on a datum shows the server message next to it", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.restore.mockRejectedValue(apiError(500, "unexpected_error", "Ocurrió un error inesperado. Inténtalo de nuevo."));
    const edited = sheet({ address: { value: "CL OTHER", original: "CL TEST 1", edited: true } });
    const { user } = mount({ api, initial: edited });
    await user.click(within(rowOf("Dirección")).getByRole("button", { name: /Restaurar/ }));
    expect(await within(rowOf("Dirección")).findByRole("alert")).toHaveTextContent("Ocurrió un error inesperado.");
    expect(control("Dirección")).toBeEnabled();
  });

  describe.each([
    [403, "no_authority", "Solo el director de proyecto puede cambiar los datos técnicos."],
    [409, "technical_data_not_editable", "Los datos técnicos solo se pueden cambiar en la fase de Briefing."],
  ])("%s (%s)", (status, code, message) => {
    const error = () => apiError(status, code, message);
    const EDITED = sheet({ address: { value: "CL OTHER", original: "CL TEST 1", edited: true } });

    it.each([
      ["editing a text", (api: ReturnType<typeof fakeTechnicalDataApi>) => api.edit.mockRejectedValue(error()), async (u: ReturnType<typeof userEvent.setup>) => { await u.clear(control("Municipio")); await u.type(control("Municipio"), "X"); await u.tab(); }],
      ["editing a list", (api: ReturnType<typeof fakeTechnicalDataApi>) => api.edit.mockRejectedValue(error()), async (u: ReturnType<typeof userEvent.setup>) => { await u.selectOptions(control("Clase"), "Rústico"); }],
      ["verifying a datum", (api: ReturnType<typeof fakeTechnicalDataApi>) => api.verify.mockRejectedValue(error()), async (u: ReturnType<typeof userEvent.setup>) => { await u.click(checkbox("Municipio")); }],
      ["restoring", (api: ReturnType<typeof fakeTechnicalDataApi>) => api.restore.mockRejectedValue(error()), async (u: ReturnType<typeof userEvent.setup>) => { await u.click(within(rowOf("Dirección")).getByRole("button", { name: /Restaurar/ })); }],
      ["verifying all", (api: ReturnType<typeof fakeTechnicalDataApi>) => api.verifyAll.mockRejectedValue(error()), async (u: ReturnType<typeof userEvent.setup>) => { await u.click(screen.getByRole("button", { name: "Marcar todo como verificado" })); }],
      ["querying", (api: ReturnType<typeof fakeTechnicalDataApi>) => api.refresh.mockRejectedValue(error()), async (u: ReturnType<typeof userEvent.setup>) => { await u.click(screen.getByRole("button", { name: "Volver a consultar" })); }],
    ])("%s: general alert with the server message, focused, and the screen becomes read-only", async (_n, arrange, act) => {
      const api = fakeTechnicalDataApi({ initial: EDITED });
      arrange(api);
      const { user } = mount({ api, initial: EDITED });
      await act(user);
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(message);
      await waitFor(() => expect(alert).toHaveFocus());
      // not inside any datum row
      expect(within(rowOf("Dirección")).queryByRole("alert")).not.toBeInTheDocument();
      expectReadOnly();
      // the stored values are still the ones the server last returned
      expect(control("Dirección")).toHaveValue("CL OTHER");
    });
  });

  it("404 on a datum: general alert with the message, focused, screen still editable", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.edit.mockRejectedValue(apiError(404, "unknown_datum", "No existe el dato técnico."));
    const { user } = mount({ api });
    await user.selectOptions(control("Clase"), "Rústico");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No existe el dato técnico.");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(control("Dirección")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Volver a consultar" })).toBeEnabled();
  });

  it("422 on refresh (invalid reference for the server): general alert with its message, screen still editable", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.refresh.mockRejectedValue(apiError(422, "invalid_cadastral_reference", "La referencia catastral no es válida."));
    const { user } = mount({ api });
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La referencia catastral no es válida.");
    expect(control("Dirección")).toBeEnabled();
  });

  it("404 on refresh (reference not found): the message, data untouched", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.refresh.mockRejectedValue(apiError(404, "cadastral_reference_not_found", "El Catastro no conoce esa referencia."));
    const { user } = mount({ api });
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El Catastro no conoce esa referencia.");
    expect(control("Dirección")).toHaveValue("CL TEST 1");
    expect(screen.getByRole("button", { name: "Volver a consultar" })).toBeEnabled();
  });

  it("a general notice goes away after the next successful action", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.refresh.mockRejectedValueOnce(apiError(404, "cadastral_reference_not_found", "El Catastro no conoce esa referencia."));
    api.refresh.mockResolvedValueOnce({ ...FILLED, unmapped: [] });
    const { user } = mount({ api });
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    await screen.findByText("El Catastro no conoce esa referencia.");
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    await waitFor(() => expect(screen.queryByText("El Catastro no conoce esa referencia.")).not.toBeInTheDocument());
  });
});

describe("503 · Catastro unavailable (manual route)", () => {
  const MESSAGE = "El Catastro no está disponible ahora mismo. Introduce los datos a mano.";
  const unavailable = () => apiError(503, "cadastre_unavailable", MESSAGE);

  it("without data: shows the server message and «Introducir datos manualmente», which opens the empty catalog", async () => {
    const api = fakeTechnicalDataApi();
    api.refresh.mockRejectedValue(unavailable());
    const { user } = mount({ api, initial: null });
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(MESSAGE);
    expect(screen.getByRole("button", { name: "Obtener datos técnicos" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Introducir datos manualmente" }));
    expect(await screen.findByRole("heading", { name: "Parcela" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(DEFINITIONS.length);
    expect(control("Dirección")).toHaveValue("");
    expect(api.edit).not.toHaveBeenCalled();
    // and from there a manual entry is saved through the API
    await user.type(control("Dirección"), "CL MANUAL 1");
    await user.tab();
    await waitFor(() => expect(api.edit).toHaveBeenCalledWith(CODE, "address", "CL MANUAL 1"));
    expect(screen.queryByText("Editado")).not.toBeInTheDocument();
  });

  it("with data: shows the message, leaves the data untouched and offers no manual button", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.refresh.mockRejectedValue(unavailable());
    const { user } = mount({ api });
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(MESSAGE);
    expect(screen.queryByRole("button", { name: "Introducir datos manualmente" })).not.toBeInTheDocument();
    expect(control("Dirección")).toHaveValue("CL TEST 1");
    expect(screen.getByRole("button", { name: "Volver a consultar" })).toBeEnabled();
    expect(control("Dirección")).toBeEnabled();
  });

  it("retrying after a 503 clears the message", async () => {
    const api = fakeTechnicalDataApi();
    api.refresh.mockRejectedValueOnce(unavailable()).mockResolvedValueOnce({ ...FILLED, unmapped: [] });
    const { user } = mount({ api, initial: null });
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    await screen.findByText(MESSAGE);
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    await screen.findByRole("heading", { name: "Parcela" });
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
  });
});

describe("data without a value (altitude, slope, INSPIRE polygon... not available yet)", () => {
  it("they render as empty, editable, unverified, without an edited mark, and the capacity shows its notice", async () => {
    mount({ initial: FILLED });
    for (const label of ["Altitud", "Pendiente", "Sup. de parcela (polígono)"]) {
      expect(control(label)).toHaveValue("");
      expect(control(label)).toBeEnabled();
      expect(within(rowOf(label)).queryByText("Editado")).not.toBeInTheDocument();
      expect(checkbox(label)).not.toBeChecked();
    }
    expect(control("Tipo de pendiente")).toHaveValue("");
    expect(screen.getByText("Rellena edificabilidad, ocupación y número de plantas para calcular la capacidad.")).toBeInTheDocument();
  });

  it("a datum with an empty original that the person fills in shows «Valor de Open-Meteo: vacío»", async () => {
    const { user } = mount();
    await user.type(control("Altitud"), "55");
    await user.tab();
    await waitFor(() => expect(rowOf("Altitud")).toHaveTextContent("Valor de Open-Meteo: vacío"));
    expect(within(rowOf("Altitud")).getByText("Editado")).toBeInTheDocument();
  });

  it("the server's `edited` flag decides the mark", async () => {
    const s = sheet({ address: { value: "A", original: "B", edited: false } });
    mount({ initial: s, api: fakeTechnicalDataApi({ initial: s }) });
    expect(within(rowOf("Dirección")).queryByText("Editado")).not.toBeInTheDocument();
  });
});

describe("accessibility", () => {
  it("loaded sheet", async () => {
    const { container } = mount();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("while loading", async () => {
    const api = fakeTechnicalDataApi();
    api.load.mockReturnValue(new Promise(() => undefined));
    const { container } = render(
      <main>
        <TechnicalDataEditor projectCode={CODE} cadastralReference="" mode="edit" api={api} />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("with a datum error, and with the read-only general alert", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.edit.mockRejectedValueOnce(apiError(422, "invalid_value", "El año debe ser un número."));
    api.verify.mockRejectedValueOnce(apiError(403, "no_authority", "Sin autoridad."));
    const { user, container } = mount({ api });
    await user.clear(control("Año de construcción"));
    await user.type(control("Año de construcción"), "abc");
    await user.tab();
    await within(rowOf("Año de construcción")).findByRole("alert");
    expect(await axe(container)).toHaveNoViolations();
    await user.click(checkbox("Municipio"));
    await screen.findByText("Sin autoridad.");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("while saving and with the unmapped and 503 notices", async () => {
    const d = deferred<TechnicalDatum>();
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.edit.mockReturnValue(d.promise);
    api.refresh.mockResolvedValue({ ...FILLED, unmapped: ["use"] });
    const { user, container } = mount({ api });
    await user.selectOptions(control("Clase"), "Rústico");
    expect(await axe(container)).toHaveNoViolations();
    d.resolve({ id: "propertyClass", value: "Rústico", original: "Urbano", verified: false, edited: true });
    await waitFor(() => expect(screen.queryByText("Guardando…")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    await screen.findByText(/No se pudieron rellenar/);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("focus management (Judge: focus must not fall to document.body)", () => {
  const EDITED = sheet({ address: { value: "CL OTHER", original: "CL TEST 1", edited: true } });

  it("verifying with the keyboard leaves the focus on the datum's control", async () => {
    const { user } = mount();
    checkbox("Municipio").focus();
    await user.keyboard(" ");
    await waitFor(() => expect(checkbox("Municipio")).toBeChecked());
    await waitFor(() => expect(control("Municipio")).toHaveFocus());
  });

  it("restoring with the keyboard leaves the focus on the datum's control", async () => {
    const api = fakeTechnicalDataApi({ initial: EDITED });
    const { user } = mount({ api, initial: EDITED });
    within(rowOf("Dirección")).getByRole("button", { name: /Restaurar/ }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(control("Dirección")).toHaveValue("CL TEST 1"));
    await waitFor(() => expect(control("Dirección")).toHaveFocus());
  });

  it("«Marcar todo como verificado» keeps the focus on its button", async () => {
    const { user } = mount();
    const button = screen.getByRole("button", { name: "Marcar todo como verificado" });
    await user.click(button);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Verificando…" })).not.toBeInTheDocument());
    expect(document.activeElement).not.toBe(document.body);
    await waitFor(() => expect(screen.getByRole("button", { name: "Marcar todo como verificado" })).toHaveFocus());
  });

  it("«Volver a consultar» gets the focus back when the query ends", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.refresh.mockResolvedValue({ ...FILLED, unmapped: [] });
    const { user } = mount({ api });
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Volver a consultar" })).toHaveFocus());
  });

  it("«Obtener datos técnicos» gets the focus back (the button turns into «Volver a consultar»)", async () => {
    const api = fakeTechnicalDataApi();
    api.refresh.mockResolvedValue({ ...FILLED, unmapped: [] });
    const { user } = mount({ api, initial: null });
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    await screen.findByRole("heading", { name: "Parcela" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Volver a consultar" })).toHaveFocus());
  });
});

describe("read-only drops the unsaved draft", () => {
  it("after a 403 the field shows the stored value, not what was typed", async () => {
    const api = fakeTechnicalDataApi({ initial: FILLED });
    api.edit.mockRejectedValue(apiError(403, "no_authority", "Sin autoridad."));
    const { user } = mount({ api });
    await user.clear(control("Municipio"));
    await user.type(control("Municipio"), "TYPED");
    await user.tab();
    await screen.findByText("Sin autoridad.");
    expect(control("Municipio")).toBeDisabled();
    expect(control("Municipio")).toHaveValue("MUNI TEST");
  });
});
