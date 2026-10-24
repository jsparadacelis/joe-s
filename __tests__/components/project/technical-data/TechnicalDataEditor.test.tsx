import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { TechnicalDataEditor } from "@/components/project/technical-data/TechnicalDataEditor";
import { DEFINITIONS, type TechnicalData, type TechnicalDatum } from "@/lib/technical-data";

jest.setTimeout(20000);

const REF = "1234567DG3413S0001AB";

const VALUES: Record<string, string> = {
  address: "CL PRUEBA 1", municipality: "MUNI PRUEBA", propertyClass: "Urbano", use: "Residencial", year: "1990", builtArea: "100", cadastralPlotArea: "100", polygonPlotArea: "98",
  coords: "40,00 N · 2,00 E", altitude: "10", slope: "2", slopeType: "Llana (< 3 %)",
  climateZone: "D2", seismicAcceleration: "< 0,04 g", kCoefficient: "1,0", windZone: "A", snowZone: "1", pvProduction: "1300",
  buildability: "", maxOccupancy: "", maxHeight: "", floors: "", streetSetback: "", boundarySetback: "", minPlot: "", calcArea: "Catastral",
};

/** Datos construidos en el test (no dependen de los datos de ejemplo de la librería). */
function data(sobre: Record<string, Partial<TechnicalDatum>> = {}, values: Record<string, string> = {}): TechnicalData {
  const list: TechnicalDatum[] = DEFINITIONS.map((d) => {
    const value = values[d.id] ?? VALUES[d.id];
    const base: TechnicalDatum = { id: d.id, value, original: d.group === "planning" ? null : value, verified: false };
    return { ...base, ...sobre[d.id] };
  });
  return { cadastralReference: REF, queriedOn: "2026-10-18", data: list };
}

/** Fila de un dato: primer ancestro del control que contiene una casilla. */
function row(control: HTMLElement): HTMLElement {
  let el: HTMLElement | null = control.parentElement;
  while (el && !el.querySelector('input[type="checkbox"]')) el = el.parentElement;
  if (!el) throw new Error("fila sin casilla");
  return el;
}
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const control = (label: string) => screen.getByLabelText(new RegExp(`^${escapar(label)}`));
const rowOf = (label: string) => row(control(label));
const checkbox = (label: string) => within(rowOf(label)).getByRole("checkbox");

async function escribir(user: ReturnType<typeof userEvent.setup>, label: string, text: string) {
  const c = control(label);
  await user.clear(c);
  if (text) await user.type(c, text);
}

function mount(props: Partial<React.ComponentProps<typeof TechnicalDataEditor>> = {}) {
  const query = (props.query as jest.Mock | undefined) ?? jest.fn().mockResolvedValue(data());
  const user = userEvent.setup();
  const r = render(
    <TechnicalDataEditor cadastralReference={REF} initial={null} mode="edit" {...props} query={query} />,
  );
  return { user, query, ...r };
}

const queryButton = () => screen.getByRole("button", { name: /Obtener datos técnicos|Volver a consultar|Consultando/ });

async function queried() {
  const m = mount();
  await m.user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
  await screen.findByRole("heading", { name: "Parcela" });
  return m;
}

describe("DatosTecnicosEditor · antes de consultar", () => {
  it("solo se ve la entrada: referencia prellenada y «Obtener datos técnicos»", () => {
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

  it("la referencia es editable", async () => {
    const { user } = mount();
    const field = screen.getByLabelText(/Referencia catastral/);
    await user.clear(field);
    await user.type(field, "ABCDEFGH123456789012");
    expect(field).toHaveValue("ABCDEFGH123456789012");
  });
});

describe("DatosTecnicosEditor · referencia inválida", () => {
  it.each([
    ["corta", "123"],
    ["con símbolos", "1234567DG3413S0001A!"],
    ["vacía", ""],
  ])("referencia %s: aviso y no se consulta", async (_n, ref) => {
    const { user, query } = mount();
    await escribir(user, "Referencia catastral", ref);
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    expect(screen.getByText("La referencia catastral debe tener 20 caracteres.")).toBeInTheDocument();
    expect(query).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Parcela" })).not.toBeInTheDocument();
  });

  it("sin aviso mientras la referencia es válida", async () => {
    const { user } = mount();
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    expect(screen.queryByText("La referencia catastral debe tener 20 caracteres.")).not.toBeInTheDocument();
  });

  it("al corregir la referencia y volver a pulsar, se consulta", async () => {
    const { user, query } = mount();
    await escribir(user, "Referencia catastral", "123");
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    await escribir(user, "Referencia catastral", REF);
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(REF);
    await screen.findByRole("heading", { name: "Parcela" });
  });
});

describe("DatosTecnicosEditor · consulta", () => {
  it("muestra «Consultando…» con el botón deshabilitado y luego los datos", async () => {
    let resolver!: (d: TechnicalData) => void;
    const query = jest.fn(() => new Promise<TechnicalData>((r) => (resolver = r)));
    const { user } = mount({ query });
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    const b = screen.getByRole("button", { name: "Consultando…" });
    expect(b).toBeDisabled();
    expect(query).toHaveBeenCalledWith(REF);
    expect(screen.queryByRole("heading", { name: "Parcela" })).not.toBeInTheDocument();
    resolver(data());
    await screen.findByRole("heading", { name: "Parcela" });
    expect(screen.queryByRole("button", { name: "Consultando…" })).not.toBeInTheDocument();
  });

  it("tras consultar aparecen los tres grupos, la capacidad y el botón cambia a «Volver a consultar»", async () => {
    await queried();
    expect(screen.getByRole("heading", { name: "Condiciones técnicas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Planeamiento" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Capacidad" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volver a consultar" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Obtener datos técnicos" })).not.toBeInTheDocument();
    expect(screen.getByText("Catastro, INSPIRE y Open-Meteo")).toBeInTheDocument();
  });

  it("cada dato muestra su valor, su origen y su unidad", async () => {
    await queried();
    expect(control("Dirección")).toHaveValue("CL PRUEBA 1");
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

  it("los datos con opciones son listas con «Sin dato» y las opciones del dato", async () => {
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

  it("cada uno de los 26 datos tiene su control con etiqueta y su casilla «Verificado»", async () => {
    await queried();
    expect(screen.getAllByRole("checkbox")).toHaveLength(26);
    for (const d of DEFINITIONS) {
      expect(control(d.label)).toHaveAccessibleName();
      expect(checkbox(d.label)).toHaveAccessibleName(/Verificado/);
      expect(checkbox(d.label)).not.toBeChecked();
    }
  });

  it("anuncia el resultado en una región aria-live", async () => {
    const { container } = await queried();
    const vivas = Array.from(container.querySelectorAll("[aria-live]"));
    expect(vivas.length).toBeGreaterThan(0);
    expect(vivas.some((el) => /26 sin verificar/.test(el.textContent ?? ""))).toBe(true);
  });

  it("con `inicial` muestra los datos sin consultar", () => {
    const { query } = mount({ initial: data() });
    expect(query).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Parcela" })).toBeInTheDocument();
    expect(control("Municipio")).toHaveValue("MUNI PRUEBA");
    expect(screen.getByRole("button", { name: "Volver a consultar" })).toBeEnabled();
  });
});

describe("DatosTecnicosEditor · edición y restaurar", () => {
  it("editar un texto con origen muestra «Editado» y el valor de origen; «Restaurar» lo devuelve", async () => {
    const { user } = await queried();
    expect(within(rowOf("Dirección")).queryByText("Editado")).not.toBeInTheDocument();
    expect(within(rowOf("Dirección")).queryByRole("button", { name: /Restaurar/ })).not.toBeInTheDocument();

    await escribir(user, "Dirección", "CL NUEVA 2");
    const f = rowOf("Dirección");
    expect(within(f).getByText("Editado")).toBeInTheDocument();
    expect(f).toHaveTextContent("Valor de Catastro: CL PRUEBA 1");

    await user.click(within(f).getByRole("button", { name: /Restaurar/ }));
    expect(control("Dirección")).toHaveValue("CL PRUEBA 1");
    expect(within(rowOf("Dirección")).queryByText("Editado")).not.toBeInTheDocument();
    expect(rowOf("Dirección")).not.toHaveTextContent("Valor de Catastro");
  });

  it("editar una lista muestra «Editado» con el origen del dato; «Sin dato» deja el valor vacío", async () => {
    const { user } = await queried();
    await user.selectOptions(control("Clase"), "Rústico");
    expect(control("Clase")).toHaveValue("Rústico");
    expect(within(rowOf("Clase")).getByText("Editado")).toBeInTheDocument();
    expect(rowOf("Clase")).toHaveTextContent("Valor de Catastro: Urbano");

    await user.selectOptions(control("Zona climática"), "Sin dato");
    expect(control("Zona climática")).toHaveValue("");
    expect(rowOf("Zona climática")).toHaveTextContent("Valor de CTE DB-HE · Anejo B: D2");
  });

  it("si el original estaba vacío, el aviso de origen dice «vacío»", async () => {
    const m = mount({ initial: data({ altitude: { original: "" } }, { altitude: "" }) });
    await escribir(m.user, "Altitud", "55");
    expect(rowOf("Altitud")).toHaveTextContent(/Valor de Open-Meteo: vacío/);
  });

  it("volver a escribir el valor original quita la marca de editado", async () => {
    const { user } = await queried();
    await escribir(user, "Municipio", "OTRO");
    expect(within(rowOf("Municipio")).getByText("Editado")).toBeInTheDocument();
    await escribir(user, "Municipio", "MUNI PRUEBA");
    expect(within(rowOf("Municipio")).queryByText("Editado")).not.toBeInTheDocument();
  });

  it("un dato manual (sin original) editado NO muestra «Editado» ni «Restaurar»", async () => {
    const { user } = await queried();
    await escribir(user, "Edificabilidad", "2");
    expect(control("Edificabilidad")).toHaveValue("2");
    const f = rowOf("Edificabilidad");
    expect(within(f).queryByText("Editado")).not.toBeInTheDocument();
    expect(within(f).queryByRole("button", { name: /Restaurar/ })).not.toBeInTheDocument();
    expect(f).not.toHaveTextContent("Valor de");
  });

  it("el contador «{n} editados» sube al editar y baja al restaurar", async () => {
    const { user } = await queried();
    expect(screen.queryByText("1 editados")).not.toBeInTheDocument();
    await escribir(user, "Dirección", "X");
    expect(screen.getByText("1 editados")).toBeInTheDocument();
    await escribir(user, "Municipio", "Y");
    expect(screen.getByText("2 editados")).toBeInTheDocument();
    await user.click(within(rowOf("Dirección")).getByRole("button", { name: /Restaurar/ }));
    expect(screen.getByText("1 editados")).toBeInTheDocument();
  });

  it("un dato editado conserva su marca de editado en `inicial`", () => {
    mount({ initial: data({ address: { value: "CL OTRA 5" } }) });
    expect(within(rowOf("Dirección")).getByText("Editado")).toBeInTheDocument();
    expect(screen.getByText("1 editados")).toBeInTheDocument();
  });
});

describe("DatosTecnicosEditor · verificación", () => {
  it("marcar «Verificado» actualiza el contador y desmarcar lo revierte", async () => {
    const { user } = await queried();
    expect(screen.getByText("26 sin verificar")).toBeInTheDocument();
    await user.click(checkbox("Dirección"));
    expect(checkbox("Dirección")).toBeChecked();
    expect(screen.getByText("25 sin verificar")).toBeInTheDocument();
    await user.click(checkbox("Dirección"));
    expect(checkbox("Dirección")).not.toBeChecked();
    expect(screen.getByText("26 sin verificar")).toBeInTheDocument();
  });

  it("verificar los 26 uno a uno muestra «Todo verificado»", async () => {
    const { user } = await queried();
    for (const c of screen.getAllByRole("checkbox")) await user.click(c);
    expect(screen.getByText("Todo verificado")).toBeInTheDocument();
    expect(screen.queryByText(/sin verificar/)).not.toBeInTheDocument();
  });

  it("«Marcar todo como verificado» marca todas las casillas y muestra «Todo verificado»", async () => {
    const { user } = await queried();
    await user.click(screen.getByRole("button", { name: "Marcar todo como verificado" }));
    for (const c of screen.getAllByRole("checkbox")) expect(c).toBeChecked();
    expect(screen.getByText("Todo verificado")).toBeInTheDocument();
    expect(screen.queryByText(/sin verificar/)).not.toBeInTheDocument();
  });

  it("editar un dato no cambia su casilla de verificado", async () => {
    const { user } = await queried();
    await user.click(checkbox("Municipio"));
    await escribir(user, "Municipio", "OTRO");
    expect(checkbox("Municipio")).toBeChecked();
  });

  it("con `inicial` ya verificado muestra «Todo verificado»", () => {
    const todos = Object.fromEntries(DEFINITIONS.map((d) => [d.id, { verified: true }]));
    mount({ initial: data(todos) });
    expect(screen.getByText("Todo verificado")).toBeInTheDocument();
  });
});

describe("DatosTecnicosEditor · capacidad", () => {
  const AVISO = "Rellena edificabilidad, ocupación y número de plantas para calcular la capacidad.";

  it("sin planeamiento muestra el aviso en lugar de cifras", async () => {
    await queried();
    expect(screen.getByText(AVISO)).toBeInTheDocument();
  });

  it("se calcula en vivo cuando existen edificabilidad, ocupación y plantas", async () => {
    const { user, container } = await queried();
    await escribir(user, "Edificabilidad", "2");
    await escribir(user, "Ocupación máxima", "50");
    expect(screen.getByText(AVISO)).toBeInTheDocument();
    await user.selectOptions(control("Número de plantas"), "PB+2");
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
    // superficie 100: techo 200, huella 50, huella × plantas 150 → limita ocupación × plantas
    expect(container).toHaveTextContent(/200 m²t/);
    expect(container).toHaveTextContent(/150 m²t/);
    expect(container).toHaveTextContent("limita: Ocupación × plantas");
  });

  it("se recalcula al editar: edificabilidad 1 pasa a limitar la edificabilidad", async () => {
    const { user, container } = await queried();
    await escribir(user, "Edificabilidad", "2");
    await escribir(user, "Ocupación máxima", "50");
    await user.selectOptions(control("Número de plantas"), "PB+2");
    expect(container).toHaveTextContent("limita: Ocupación × plantas");
    await escribir(user, "Edificabilidad", "1");
    expect(container).toHaveTextContent("limita: Edificabilidad");
    expect(container).not.toHaveTextContent("limita: Ocupación × plantas");
    expect(container).toHaveTextContent(/100 m²t/);
  });

  it("vuelve al aviso si se vacía un dato necesario", async () => {
    const { user } = await queried();
    await escribir(user, "Edificabilidad", "2");
    await escribir(user, "Ocupación máxima", "50");
    await user.selectOptions(control("Número de plantas"), "PB+2");
    await escribir(user, "Ocupación máxima", "");
    expect(screen.getByText(AVISO)).toBeInTheDocument();
  });

  it("usa la superficie del polígono cuando la superficie de cálculo es «Polígono»", async () => {
    const { user, container } = await queried();
    await escribir(user, "Edificabilidad", "2");
    await escribir(user, "Ocupación máxima", "50");
    await user.selectOptions(control("Número de plantas"), "PB+2");
    await user.selectOptions(control("Superficie de cálculo"), "Polígono");
    // superficie 98: techo 196, huella 49, ×3 = 147
    expect(container).toHaveTextContent(/196 m²t/);
    expect(container).toHaveTextContent(/147 m²t/);
  });

  it("indica si se cumple la parcela mínima", async () => {
    const { user, container } = await queried();
    await escribir(user, "Edificabilidad", "2");
    await escribir(user, "Ocupación máxima", "50");
    await user.selectOptions(control("Número de plantas"), "PB+2");
    await escribir(user, "Parcela mínima", "80");
    expect(container).toHaveTextContent(/Cumple/);
    expect(container).not.toHaveTextContent(/No cumple/);
    await escribir(user, "Parcela mínima", "150");
    expect(container).toHaveTextContent(/No cumple/);
  });

  it("con `inicial` completo calcula la capacidad sin editar", () => {
    const { container } = mount({
      initial: data({}, { buildability: "2", maxOccupancy: "50", floors: "PB+2" }),
    });
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
    expect(container).toHaveTextContent(/150 m²t/);
  });
});

describe("DatosTecnicosEditor · volver a consultar", () => {
  it("sustituye los datos de origen, reinicia su verificación y conserva los manuales", async () => {
    const incoming = data({}, { address: "CL OTRA 3", municipality: "MUNI NUEVO", buildability: "", calcArea: "Catastral" });
    const query = jest.fn().mockResolvedValueOnce(data()).mockResolvedValueOnce(incoming);
    const { user } = mount({ query });
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    await screen.findByRole("heading", { name: "Parcela" });

    await escribir(user, "Dirección", "CL EDITADA 9");
    await user.click(checkbox("Municipio"));
    await escribir(user, "Edificabilidad", "1,5");
    await user.selectOptions(control("Superficie de cálculo"), "Polígono");

    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    await waitFor(() => expect(control("Municipio")).toHaveValue("MUNI NUEVO"));
    expect(query).toHaveBeenCalledTimes(2);

    // origen sustituido: ya no está editado ni verificado
    expect(control("Dirección")).toHaveValue("CL OTRA 3");
    expect(within(rowOf("Dirección")).queryByText("Editado")).not.toBeInTheDocument();
    expect(checkbox("Municipio")).not.toBeChecked();
    // manuales conservados
    expect(control("Edificabilidad")).toHaveValue("1,5");
    expect(control("Superficie de cálculo")).toHaveValue("Polígono");
  });

  it("mientras vuelve a consultar el botón dice «Consultando…» y está deshabilitado", async () => {
    let resolver!: (d: TechnicalData) => void;
    const query = jest
      .fn()
      .mockResolvedValueOnce(data())
      .mockImplementationOnce(() => new Promise<TechnicalData>((r) => (resolver = r)));
    const { user } = mount({ query });
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    await screen.findByRole("heading", { name: "Parcela" });
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    expect(screen.getByRole("button", { name: "Consultando…" })).toBeDisabled();
    resolver(data());
    await screen.findByRole("button", { name: "Volver a consultar" });
  });

  it("volver a consultar con la referencia inválida avisa y no consulta", async () => {
    const { user, query } = await queried();
    await escribir(user, "Referencia catastral", "123");
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    expect(screen.getByText("La referencia catastral debe tener 20 caracteres.")).toBeInTheDocument();
    expect(query).toHaveBeenCalledTimes(1);
    expect(control("Dirección")).toHaveValue("CL PRUEBA 1");
  });
});

describe.each(["read-only", "preview"] as const)("DatosTecnicosEditor · modo %s", (mode) => {
  it("todos los controles de datos y todos los botones están deshabilitados", () => {
    const { query } = mount({ mode, initial: data({ address: { value: "CL OTRA 5" } }) });
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

  it("sigue mostrando el estado (editado, origen) pero no permite restaurar", async () => {
    const { user } = mount({ mode, initial: data({ address: { value: "CL OTRA 5" } }) });
    expect(within(rowOf("Dirección")).getByText("Editado")).toBeInTheDocument();
    expect(rowOf("Dirección")).toHaveTextContent("Valor de Catastro: CL PRUEBA 1");
    const r = within(rowOf("Dirección")).queryByRole("button", { name: /Restaurar/ });
    if (r) {
      expect(r).toBeDisabled();
      await user.click(r);
    }
    expect(control("Dirección")).toHaveValue("CL OTRA 5");
  });

  it("no se puede marcar como verificado ni marcar todo", async () => {
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

  it("no se puede consultar sin datos: botón deshabilitado y `consultar` no se llama", async () => {
    const { user, query } = mount({ mode, initial: null });
    const b = screen.queryByRole("button", { name: /Obtener datos técnicos|Volver a consultar/ });
    if (b) {
      expect(b).toBeDisabled();
      await user.click(b);
    }
    expect(query).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Parcela" })).not.toBeInTheDocument();
  });

  it("la capacidad también se muestra, sin poder editar", () => {
    const { container } = mount({ mode, initial: data({}, { buildability: "2", maxOccupancy: "50", floors: "PB+2" }) });
    expect(container).toHaveTextContent(/150 m²t/);
  });

  it("sin violaciones de accesibilidad", async () => {
    const { container } = render(
      <main>
        <TechnicalDataEditor cadastralReference={REF} initial={data({ address: { value: "CL OTRA 5" } })} mode={mode} query={jest.fn()} />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("DatosTecnicosEditor · solo lectura sin datos", () => {
  it("muestra «Sin datos técnicos registrados.» sin grupos ni consulta", () => {
    const { query } = mount({ mode: "read-only", initial: null });
    expect(screen.getByText("Sin datos técnicos registrados.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Parcela" })).not.toBeInTheDocument();
    expect(query).not.toHaveBeenCalled();
  });

  it("en edición sin datos no aparece ese mensaje", () => {
    mount({ mode: "edit", initial: null });
    expect(screen.queryByText("Sin datos técnicos registrados.")).not.toBeInTheDocument();
  });

  it("sin violaciones de accesibilidad", async () => {
    const { container } = render(
      <main>
        <TechnicalDataEditor cadastralReference="" initial={null} mode="read-only" query={jest.fn()} />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("DatosTecnicosEditor · accesibilidad", () => {
  it("antes de consultar", async () => {
    const { container } = render(
      <main>
        <TechnicalDataEditor cadastralReference={REF} initial={null} mode="edit" query={jest.fn()} />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("tras consultar, con datos editados, verificados y capacidad", async () => {
    const query = jest.fn().mockResolvedValue(data({ address: { value: "CL OTRA 5", verified: true } }, { buildability: "2", maxOccupancy: "50", floors: "PB+2" }));
    const user = userEvent.setup();
    const { container } = render(
      <main>
        <TechnicalDataEditor cadastralReference={REF} initial={null} mode="edit" query={query} />
      </main>,
    );
    await user.click(queryButton());
    await screen.findByRole("heading", { name: "Parcela" });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("con el aviso de referencia inválida", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <main>
        <TechnicalDataEditor cadastralReference="123" initial={null} mode="edit" query={jest.fn()} />
      </main>,
    );
    await user.click(queryButton());
    expect(screen.getByText("La referencia catastral debe tener 20 caracteres.")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("se puede operar con teclado: Tab llega a la casilla y Espacio la marca", async () => {
    const { user } = await queried();
    checkbox("Dirección").focus();
    expect(checkbox("Dirección")).toHaveFocus();
    await user.keyboard(" ");
    expect(checkbox("Dirección")).toBeChecked();
    expect(screen.getByText("25 sin verificar")).toBeInTheDocument();
  });
});
