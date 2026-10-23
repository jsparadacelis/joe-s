import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { DatosTecnicosEditor } from "@/components/proyecto/datos-tecnicos/DatosTecnicosEditor";
import { DEFINICIONES, type DatosTecnicos, type DatoTecnico } from "@/lib/datos-tecnicos";

jest.setTimeout(20000);

const REF = "1234567DG3413S0001AB";

const VALORES: Record<string, string> = {
  dir: "CL PRUEBA 1", muni: "MUNI PRUEBA", clase: "Urbano", uso: "Residencial", anyo: "1990", sc: "100", spc: "100", spp: "98",
  coords: "40,00 N · 2,00 E", alt: "10", pend: "2", pendcat: "Llana (< 3 %)",
  zc: "D2", ab: "< 0,04 g", k: "1,0", viento: "A", nieve: "1", fv: "1300",
  edif: "", ocup: "", altura: "", plantas: "", retv: "", retl: "", pmin: "", scalc: "Catastral",
};

/** Datos construidos en el test (no dependen de los datos de ejemplo de la librería). */
function datos(sobre: Record<string, Partial<DatoTecnico>> = {}, valores: Record<string, string> = {}): DatosTecnicos {
  const lista: DatoTecnico[] = DEFINICIONES.map((d) => {
    const valor = valores[d.id] ?? VALORES[d.id];
    const base: DatoTecnico = { id: d.id, valor, original: d.grupo === "planeamiento" ? null : valor, verificado: false };
    return { ...base, ...sobre[d.id] };
  });
  return { referenciaCatastral: REF, consultadoEl: "2026-10-18", datos: lista };
}

/** Fila de un dato: primer ancestro del control que contiene una casilla. */
function fila(control: HTMLElement): HTMLElement {
  let el: HTMLElement | null = control.parentElement;
  while (el && !el.querySelector('input[type="checkbox"]')) el = el.parentElement;
  if (!el) throw new Error("fila sin casilla");
  return el;
}
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const control = (etiqueta: string) => screen.getByLabelText(new RegExp(`^${escapar(etiqueta)}`));
const filaDe = (etiqueta: string) => fila(control(etiqueta));
const casilla = (etiqueta: string) => within(filaDe(etiqueta)).getByRole("checkbox");

async function escribir(user: ReturnType<typeof userEvent.setup>, etiqueta: string, texto: string) {
  const c = control(etiqueta);
  await user.clear(c);
  if (texto) await user.type(c, texto);
}

function montar(props: Partial<React.ComponentProps<typeof DatosTecnicosEditor>> = {}) {
  const consultar = (props.consultar as jest.Mock | undefined) ?? jest.fn().mockResolvedValue(datos());
  const user = userEvent.setup();
  const r = render(
    <DatosTecnicosEditor referenciaCatastral={REF} inicial={null} modo="edicion" {...props} consultar={consultar} />,
  );
  return { user, consultar, ...r };
}

const botonConsulta = () => screen.getByRole("button", { name: /Obtener datos técnicos|Volver a consultar|Consultando/ });

async function consultado() {
  const m = montar();
  await m.user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
  await screen.findByRole("heading", { name: "Parcela" });
  return m;
}

describe("DatosTecnicosEditor · antes de consultar", () => {
  it("solo se ve la entrada: referencia prellenada y «Obtener datos técnicos»", () => {
    montar();
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
    const { user } = montar();
    const campo = screen.getByLabelText(/Referencia catastral/);
    await user.clear(campo);
    await user.type(campo, "ABCDEFGH123456789012");
    expect(campo).toHaveValue("ABCDEFGH123456789012");
  });
});

describe("DatosTecnicosEditor · referencia inválida", () => {
  it.each([
    ["corta", "123"],
    ["con símbolos", "1234567DG3413S0001A!"],
    ["vacía", ""],
  ])("referencia %s: aviso y no se consulta", async (_n, ref) => {
    const { user, consultar } = montar();
    await escribir(user, "Referencia catastral", ref);
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    expect(screen.getByText("La referencia catastral debe tener 20 caracteres.")).toBeInTheDocument();
    expect(consultar).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Parcela" })).not.toBeInTheDocument();
  });

  it("sin aviso mientras la referencia es válida", async () => {
    const { user } = montar();
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    expect(screen.queryByText("La referencia catastral debe tener 20 caracteres.")).not.toBeInTheDocument();
  });

  it("al corregir la referencia y volver a pulsar, se consulta", async () => {
    const { user, consultar } = montar();
    await escribir(user, "Referencia catastral", "123");
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    await escribir(user, "Referencia catastral", REF);
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    expect(consultar).toHaveBeenCalledTimes(1);
    expect(consultar).toHaveBeenCalledWith(REF);
    await screen.findByRole("heading", { name: "Parcela" });
  });
});

describe("DatosTecnicosEditor · consulta", () => {
  it("muestra «Consultando…» con el botón deshabilitado y luego los datos", async () => {
    let resolver!: (d: DatosTecnicos) => void;
    const consultar = jest.fn(() => new Promise<DatosTecnicos>((r) => (resolver = r)));
    const { user } = montar({ consultar });
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    const b = screen.getByRole("button", { name: "Consultando…" });
    expect(b).toBeDisabled();
    expect(consultar).toHaveBeenCalledWith(REF);
    expect(screen.queryByRole("heading", { name: "Parcela" })).not.toBeInTheDocument();
    resolver(datos());
    await screen.findByRole("heading", { name: "Parcela" });
    expect(screen.queryByRole("button", { name: "Consultando…" })).not.toBeInTheDocument();
  });

  it("tras consultar aparecen los tres grupos, la capacidad y el botón cambia a «Volver a consultar»", async () => {
    await consultado();
    expect(screen.getByRole("heading", { name: "Condiciones técnicas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Planeamiento" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Capacidad" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volver a consultar" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Obtener datos técnicos" })).not.toBeInTheDocument();
    expect(screen.getByText("Catastro, INSPIRE y Open-Meteo")).toBeInTheDocument();
  });

  it("cada dato muestra su valor, su origen y su unidad", async () => {
    await consultado();
    expect(control("Dirección")).toHaveValue("CL PRUEBA 1");
    expect(filaDe("Dirección")).toHaveTextContent("Catastro");
    expect(control("Superficie construida")).toHaveValue("100");
    expect(filaDe("Superficie construida")).toHaveTextContent("m²");
    expect(filaDe("Producción fotovoltaica")).toHaveTextContent("kWh/kWp·año");
    expect(filaDe("Producción fotovoltaica")).toHaveTextContent("PVGIS");
    expect(control("Zona climática")).toHaveValue("D2");
    expect(filaDe("Zona climática")).toHaveTextContent("CTE DB-HE · Anejo B");
    expect(filaDe("Edificabilidad")).toHaveTextContent("Manual");
    expect(filaDe("Edificabilidad")).toHaveTextContent("m²t/m²s");
  });

  it("los datos con opciones son listas con «Sin dato» y las opciones del dato", async () => {
    await consultado();
    for (const d of DEFINICIONES) {
      const c = control(d.etiqueta);
      if (d.tipo === "lista") {
        expect(c.tagName).toBe("SELECT");
        const opciones = within(c).getAllByRole("option").map((o) => o.textContent);
        expect(opciones).toEqual(["Sin dato", ...d.opciones!]);
      } else {
        expect(c.tagName).toBe("INPUT");
      }
    }
  });

  it("cada uno de los 26 datos tiene su control con etiqueta y su casilla «Verificado»", async () => {
    await consultado();
    expect(screen.getAllByRole("checkbox")).toHaveLength(26);
    for (const d of DEFINICIONES) {
      expect(control(d.etiqueta)).toHaveAccessibleName();
      expect(casilla(d.etiqueta)).toHaveAccessibleName(/Verificado/);
      expect(casilla(d.etiqueta)).not.toBeChecked();
    }
  });

  it("anuncia el resultado en una región aria-live", async () => {
    const { container } = await consultado();
    const vivas = Array.from(container.querySelectorAll("[aria-live]"));
    expect(vivas.length).toBeGreaterThan(0);
    expect(vivas.some((el) => /26 sin verificar/.test(el.textContent ?? ""))).toBe(true);
  });

  it("con `inicial` muestra los datos sin consultar", () => {
    const { consultar } = montar({ inicial: datos() });
    expect(consultar).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Parcela" })).toBeInTheDocument();
    expect(control("Municipio")).toHaveValue("MUNI PRUEBA");
    expect(screen.getByRole("button", { name: "Volver a consultar" })).toBeEnabled();
  });
});

describe("DatosTecnicosEditor · edición y restaurar", () => {
  it("editar un texto con origen muestra «Editado» y el valor de origen; «Restaurar» lo devuelve", async () => {
    const { user } = await consultado();
    expect(within(filaDe("Dirección")).queryByText("Editado")).not.toBeInTheDocument();
    expect(within(filaDe("Dirección")).queryByRole("button", { name: /Restaurar/ })).not.toBeInTheDocument();

    await escribir(user, "Dirección", "CL NUEVA 2");
    const f = filaDe("Dirección");
    expect(within(f).getByText("Editado")).toBeInTheDocument();
    expect(f).toHaveTextContent("Valor de Catastro: CL PRUEBA 1");

    await user.click(within(f).getByRole("button", { name: /Restaurar/ }));
    expect(control("Dirección")).toHaveValue("CL PRUEBA 1");
    expect(within(filaDe("Dirección")).queryByText("Editado")).not.toBeInTheDocument();
    expect(filaDe("Dirección")).not.toHaveTextContent("Valor de Catastro");
  });

  it("editar una lista muestra «Editado» con el origen del dato; «Sin dato» deja el valor vacío", async () => {
    const { user } = await consultado();
    await user.selectOptions(control("Clase"), "Rústico");
    expect(control("Clase")).toHaveValue("Rústico");
    expect(within(filaDe("Clase")).getByText("Editado")).toBeInTheDocument();
    expect(filaDe("Clase")).toHaveTextContent("Valor de Catastro: Urbano");

    await user.selectOptions(control("Zona climática"), "Sin dato");
    expect(control("Zona climática")).toHaveValue("");
    expect(filaDe("Zona climática")).toHaveTextContent("Valor de CTE DB-HE · Anejo B: D2");
  });

  it("si el original estaba vacío, el aviso de origen dice «vacío»", async () => {
    const m = montar({ inicial: datos({ alt: { original: "" } }, { alt: "" }) });
    await escribir(m.user, "Altitud", "55");
    expect(filaDe("Altitud")).toHaveTextContent(/Valor de Open-Meteo: vacío/);
  });

  it("volver a escribir el valor original quita la marca de editado", async () => {
    const { user } = await consultado();
    await escribir(user, "Municipio", "OTRO");
    expect(within(filaDe("Municipio")).getByText("Editado")).toBeInTheDocument();
    await escribir(user, "Municipio", "MUNI PRUEBA");
    expect(within(filaDe("Municipio")).queryByText("Editado")).not.toBeInTheDocument();
  });

  it("un dato manual (sin original) editado NO muestra «Editado» ni «Restaurar»", async () => {
    const { user } = await consultado();
    await escribir(user, "Edificabilidad", "2");
    expect(control("Edificabilidad")).toHaveValue("2");
    const f = filaDe("Edificabilidad");
    expect(within(f).queryByText("Editado")).not.toBeInTheDocument();
    expect(within(f).queryByRole("button", { name: /Restaurar/ })).not.toBeInTheDocument();
    expect(f).not.toHaveTextContent("Valor de");
  });

  it("el contador «{n} editados» sube al editar y baja al restaurar", async () => {
    const { user } = await consultado();
    expect(screen.queryByText("1 editados")).not.toBeInTheDocument();
    await escribir(user, "Dirección", "X");
    expect(screen.getByText("1 editados")).toBeInTheDocument();
    await escribir(user, "Municipio", "Y");
    expect(screen.getByText("2 editados")).toBeInTheDocument();
    await user.click(within(filaDe("Dirección")).getByRole("button", { name: /Restaurar/ }));
    expect(screen.getByText("1 editados")).toBeInTheDocument();
  });

  it("un dato editado conserva su marca de editado en `inicial`", () => {
    montar({ inicial: datos({ dir: { valor: "CL OTRA 5" } }) });
    expect(within(filaDe("Dirección")).getByText("Editado")).toBeInTheDocument();
    expect(screen.getByText("1 editados")).toBeInTheDocument();
  });
});

describe("DatosTecnicosEditor · verificación", () => {
  it("marcar «Verificado» actualiza el contador y desmarcar lo revierte", async () => {
    const { user } = await consultado();
    expect(screen.getByText("26 sin verificar")).toBeInTheDocument();
    await user.click(casilla("Dirección"));
    expect(casilla("Dirección")).toBeChecked();
    expect(screen.getByText("25 sin verificar")).toBeInTheDocument();
    await user.click(casilla("Dirección"));
    expect(casilla("Dirección")).not.toBeChecked();
    expect(screen.getByText("26 sin verificar")).toBeInTheDocument();
  });

  it("verificar los 26 uno a uno muestra «Todo verificado»", async () => {
    const { user } = await consultado();
    for (const c of screen.getAllByRole("checkbox")) await user.click(c);
    expect(screen.getByText("Todo verificado")).toBeInTheDocument();
    expect(screen.queryByText(/sin verificar/)).not.toBeInTheDocument();
  });

  it("«Marcar todo como verificado» marca todas las casillas y muestra «Todo verificado»", async () => {
    const { user } = await consultado();
    await user.click(screen.getByRole("button", { name: "Marcar todo como verificado" }));
    for (const c of screen.getAllByRole("checkbox")) expect(c).toBeChecked();
    expect(screen.getByText("Todo verificado")).toBeInTheDocument();
    expect(screen.queryByText(/sin verificar/)).not.toBeInTheDocument();
  });

  it("editar un dato no cambia su casilla de verificado", async () => {
    const { user } = await consultado();
    await user.click(casilla("Municipio"));
    await escribir(user, "Municipio", "OTRO");
    expect(casilla("Municipio")).toBeChecked();
  });

  it("con `inicial` ya verificado muestra «Todo verificado»", () => {
    const todos = Object.fromEntries(DEFINICIONES.map((d) => [d.id, { verificado: true }]));
    montar({ inicial: datos(todos) });
    expect(screen.getByText("Todo verificado")).toBeInTheDocument();
  });
});

describe("DatosTecnicosEditor · capacidad", () => {
  const AVISO = "Rellena edificabilidad, ocupación y número de plantas para calcular la capacidad.";

  it("sin planeamiento muestra el aviso en lugar de cifras", async () => {
    await consultado();
    expect(screen.getByText(AVISO)).toBeInTheDocument();
  });

  it("se calcula en vivo cuando existen edificabilidad, ocupación y plantas", async () => {
    const { user, container } = await consultado();
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
    const { user, container } = await consultado();
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
    const { user } = await consultado();
    await escribir(user, "Edificabilidad", "2");
    await escribir(user, "Ocupación máxima", "50");
    await user.selectOptions(control("Número de plantas"), "PB+2");
    await escribir(user, "Ocupación máxima", "");
    expect(screen.getByText(AVISO)).toBeInTheDocument();
  });

  it("usa la superficie del polígono cuando la superficie de cálculo es «Polígono»", async () => {
    const { user, container } = await consultado();
    await escribir(user, "Edificabilidad", "2");
    await escribir(user, "Ocupación máxima", "50");
    await user.selectOptions(control("Número de plantas"), "PB+2");
    await user.selectOptions(control("Superficie de cálculo"), "Polígono");
    // superficie 98: techo 196, huella 49, ×3 = 147
    expect(container).toHaveTextContent(/196 m²t/);
    expect(container).toHaveTextContent(/147 m²t/);
  });

  it("indica si se cumple la parcela mínima", async () => {
    const { user, container } = await consultado();
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
    const { container } = montar({
      inicial: datos({}, { edif: "2", ocup: "50", plantas: "PB+2" }),
    });
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
    expect(container).toHaveTextContent(/150 m²t/);
  });
});

describe("DatosTecnicosEditor · volver a consultar", () => {
  it("sustituye los datos de origen, reinicia su verificación y conserva los manuales", async () => {
    const nuevos = datos({}, { dir: "CL OTRA 3", muni: "MUNI NUEVO", edif: "", scalc: "Catastral" });
    const consultar = jest.fn().mockResolvedValueOnce(datos()).mockResolvedValueOnce(nuevos);
    const { user } = montar({ consultar });
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    await screen.findByRole("heading", { name: "Parcela" });

    await escribir(user, "Dirección", "CL EDITADA 9");
    await user.click(casilla("Municipio"));
    await escribir(user, "Edificabilidad", "1,5");
    await user.selectOptions(control("Superficie de cálculo"), "Polígono");

    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    await waitFor(() => expect(control("Municipio")).toHaveValue("MUNI NUEVO"));
    expect(consultar).toHaveBeenCalledTimes(2);

    // origen sustituido: ya no está editado ni verificado
    expect(control("Dirección")).toHaveValue("CL OTRA 3");
    expect(within(filaDe("Dirección")).queryByText("Editado")).not.toBeInTheDocument();
    expect(casilla("Municipio")).not.toBeChecked();
    // manuales conservados
    expect(control("Edificabilidad")).toHaveValue("1,5");
    expect(control("Superficie de cálculo")).toHaveValue("Polígono");
  });

  it("mientras vuelve a consultar el botón dice «Consultando…» y está deshabilitado", async () => {
    let resolver!: (d: DatosTecnicos) => void;
    const consultar = jest
      .fn()
      .mockResolvedValueOnce(datos())
      .mockImplementationOnce(() => new Promise<DatosTecnicos>((r) => (resolver = r)));
    const { user } = montar({ consultar });
    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    await screen.findByRole("heading", { name: "Parcela" });
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    expect(screen.getByRole("button", { name: "Consultando…" })).toBeDisabled();
    resolver(datos());
    await screen.findByRole("button", { name: "Volver a consultar" });
  });

  it("volver a consultar con la referencia inválida avisa y no consulta", async () => {
    const { user, consultar } = await consultado();
    await escribir(user, "Referencia catastral", "123");
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    expect(screen.getByText("La referencia catastral debe tener 20 caracteres.")).toBeInTheDocument();
    expect(consultar).toHaveBeenCalledTimes(1);
    expect(control("Dirección")).toHaveValue("CL PRUEBA 1");
  });
});

describe.each(["solo-lectura", "vista-previa"] as const)("DatosTecnicosEditor · modo %s", (modo) => {
  it("todos los controles de datos y todos los botones están deshabilitados", () => {
    const { consultar } = montar({ modo, inicial: datos({ dir: { valor: "CL OTRA 5" } }) });
    const campos = [...screen.getAllByRole("textbox"), ...screen.getAllByRole("combobox"), ...screen.getAllByRole("checkbox")];
    expect(screen.getAllByRole("checkbox")).toHaveLength(26);
    for (const d of DEFINICIONES) {
      expect(control(d.etiqueta)).toBeDisabled();
      expect(casilla(d.etiqueta)).toBeDisabled();
    }
    for (const c of campos) {
      if (c === screen.queryByLabelText(/Referencia catastral/)) {
        expect((c as HTMLInputElement).disabled || (c as HTMLInputElement).readOnly).toBe(true);
      } else {
        expect(c).toBeDisabled();
      }
    }
    for (const b of screen.queryAllByRole("button")) expect(b).toBeDisabled();
    expect(consultar).not.toHaveBeenCalled();
  });

  it("sigue mostrando el estado (editado, origen) pero no permite restaurar", async () => {
    const { user } = montar({ modo, inicial: datos({ dir: { valor: "CL OTRA 5" } }) });
    expect(within(filaDe("Dirección")).getByText("Editado")).toBeInTheDocument();
    expect(filaDe("Dirección")).toHaveTextContent("Valor de Catastro: CL PRUEBA 1");
    const r = within(filaDe("Dirección")).queryByRole("button", { name: /Restaurar/ });
    if (r) {
      expect(r).toBeDisabled();
      await user.click(r);
    }
    expect(control("Dirección")).toHaveValue("CL OTRA 5");
  });

  it("no se puede marcar como verificado ni marcar todo", async () => {
    const { user } = montar({ modo, inicial: datos() });
    await user.click(casilla("Dirección"));
    expect(casilla("Dirección")).not.toBeChecked();
    const todo = screen.queryByRole("button", { name: "Marcar todo como verificado" });
    if (todo) {
      expect(todo).toBeDisabled();
      await user.click(todo);
    }
    expect(screen.getByText("26 sin verificar")).toBeInTheDocument();
  });

  it("no se puede consultar sin datos: botón deshabilitado y `consultar` no se llama", async () => {
    const { user, consultar } = montar({ modo, inicial: null });
    const b = screen.queryByRole("button", { name: /Obtener datos técnicos|Volver a consultar/ });
    if (b) {
      expect(b).toBeDisabled();
      await user.click(b);
    }
    expect(consultar).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Parcela" })).not.toBeInTheDocument();
  });

  it("la capacidad también se muestra, sin poder editar", () => {
    const { container } = montar({ modo, inicial: datos({}, { edif: "2", ocup: "50", plantas: "PB+2" }) });
    expect(container).toHaveTextContent(/150 m²t/);
  });

  it("sin violaciones de accesibilidad", async () => {
    const { container } = render(
      <main>
        <DatosTecnicosEditor referenciaCatastral={REF} inicial={datos({ dir: { valor: "CL OTRA 5" } })} modo={modo} consultar={jest.fn()} />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("DatosTecnicosEditor · solo lectura sin datos", () => {
  it("muestra «Sin datos técnicos registrados.» sin grupos ni consulta", () => {
    const { consultar } = montar({ modo: "solo-lectura", inicial: null });
    expect(screen.getByText("Sin datos técnicos registrados.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Parcela" })).not.toBeInTheDocument();
    expect(consultar).not.toHaveBeenCalled();
  });

  it("en edición sin datos no aparece ese mensaje", () => {
    montar({ modo: "edicion", inicial: null });
    expect(screen.queryByText("Sin datos técnicos registrados.")).not.toBeInTheDocument();
  });

  it("sin violaciones de accesibilidad", async () => {
    const { container } = render(
      <main>
        <DatosTecnicosEditor referenciaCatastral="" inicial={null} modo="solo-lectura" consultar={jest.fn()} />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("DatosTecnicosEditor · accesibilidad", () => {
  it("antes de consultar", async () => {
    const { container } = render(
      <main>
        <DatosTecnicosEditor referenciaCatastral={REF} inicial={null} modo="edicion" consultar={jest.fn()} />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("tras consultar, con datos editados, verificados y capacidad", async () => {
    const consultar = jest.fn().mockResolvedValue(datos({ dir: { valor: "CL OTRA 5", verificado: true } }, { edif: "2", ocup: "50", plantas: "PB+2" }));
    const user = userEvent.setup();
    const { container } = render(
      <main>
        <DatosTecnicosEditor referenciaCatastral={REF} inicial={null} modo="edicion" consultar={consultar} />
      </main>,
    );
    await user.click(botonConsulta());
    await screen.findByRole("heading", { name: "Parcela" });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("con el aviso de referencia inválida", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <main>
        <DatosTecnicosEditor referenciaCatastral="123" inicial={null} modo="edicion" consultar={jest.fn()} />
      </main>,
    );
    await user.click(botonConsulta());
    expect(screen.getByText("La referencia catastral debe tener 20 caracteres.")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("se puede operar con teclado: Tab llega a la casilla y Espacio la marca", async () => {
    const { user } = await consultado();
    casilla("Dirección").focus();
    expect(casilla("Dirección")).toHaveFocus();
    await user.keyboard(" ");
    expect(casilla("Dirección")).toBeChecked();
    expect(screen.getByText("25 sin verificar")).toBeInTheDocument();
  });
});
