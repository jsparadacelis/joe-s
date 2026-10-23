import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { VisorRelieve } from "@/components/proyecto/relieve/VisorRelieve";
import { montarEscena } from "@/lib/relieve-escena";
import { calcularLecturas } from "@/lib/relieve-lecturas";
import type { OpcionesRelieve, Relieve } from "@/lib/relieve";
import { planoInclinado } from "../../../helpers/relieve-plano";

// jsdom no tiene WebGL: la escena (único módulo que importa three) se sustituye por una falsa.
jest.mock("@/lib/relieve-escena", () => ({ montarEscena: jest.fn() }));

jest.setTimeout(20000);

const REF = "1234567DG3413S0001AB";
const REF2 = "7654321DG3413S0001ZZ";
const RUSTICA = "08187A005001230000OK";
const MENSAJE_SIN_REF = "Escribe una referencia catastral de 20 caracteres y pulsa «Ver relieve».";
const MENSAJE_SIN_WEBGL = "Este navegador no puede mostrar el modelo 3D (WebGL no disponible).";

const montar = montarEscena as jest.MockedFunction<typeof montarEscena>;

type EscenaFalsa = {
  reiniciar: jest.Mock;
  acercar: jest.Mock;
  alejar: jest.Mock;
  actualizarExageracion: jest.Mock;
  liberar: jest.Mock;
};
let escenas: EscenaFalsa[];

function nuevaEscena(): EscenaFalsa {
  const e = {
    reiniciar: jest.fn(),
    acercar: jest.fn(),
    alejar: jest.fn(),
    actualizarExageracion: jest.fn(),
    liberar: jest.fn(),
  };
  escenas.push(e);
  return e;
}

const relieveDe = (o: OpcionesRelieve, extra: Partial<Relieve> = {}) => planoInclinado({ referencia: o.referencia, ...extra });
const crearObtener = (extra: Partial<Relieve> = {}) => jest.fn(async (o: OpcionesRelieve) => relieveDe(o, extra));

beforeEach(() => {
  escenas = [];
  montar.mockReset();
  montar.mockImplementation((() => nuevaEscena()) as unknown as typeof montarEscena);
});

/** Escribe una referencia y pulsa «Ver relieve»; espera a que se monte la escena. */
async function ver(user: ReturnType<typeof userEvent.setup>, referencia: string, esperadas = montar.mock.calls.length + 1) {
  const campo = screen.getByLabelText("Referencia catastral");
  await user.clear(campo);
  await user.type(campo, referencia);
  await user.click(screen.getByRole("button", { name: "Ver relieve" }));
  await waitFor(() => expect(montar).toHaveBeenCalledTimes(esperadas));
}

/** Texto de la lectura cuya etiqueta es exactamente `etiqueta` (sirve para dl/dt/dd y para pares span/b). */
function valorDe(etiqueta: string): string {
  const el = screen.getByText(etiqueta);
  if (el.tagName === "DT" && el.nextElementSibling) return el.nextElementSibling.textContent ?? "";
  return (el.parentElement?.textContent ?? "").replace(etiqueta, "");
}
/** Números de un texto con formato es-ES (separador de miles opcional, coma decimal). */
function numeros(texto: string): number[] {
  return (texto.replace(/(\d)[.\s ](?=\d{3}(?!\d))/g, "$1").match(/\d+(?:,\d+)?/g) ?? []).map((n) =>
    parseFloat(n.replace(",", ".")),
  );
}
const enRegionViva = (el: HTMLElement) => el.closest('[aria-live], [role="alert"], [role="status"]') !== null;

describe("VisorRelieve · estado inicial", () => {
  it("muestra el campo con la referencia inicial y el botón «Ver relieve»", () => {
    render(<VisorRelieve referenciaInicial={REF} obtener={crearObtener()} />);
    expect(screen.getByRole("heading", { name: "Relieve 3D del terreno" })).toBeInTheDocument();
    expect(screen.getByLabelText("Referencia catastral")).toHaveValue(REF);
    expect(screen.getByRole("button", { name: "Ver relieve" })).toBeEnabled();
  });

  it("sin referencia: mensaje guía y nada consultado", () => {
    const obtener = crearObtener();
    render(<VisorRelieve referenciaInicial="" obtener={obtener} />);
    expect(screen.getByText(MENSAJE_SIN_REF)).toBeInTheDocument();
    expect(obtener).not.toHaveBeenCalled();
    expect(montar).not.toHaveBeenCalled();
  });

  it("valores por defecto: Parcela + 25 m, 200 m y ×2", () => {
    render(<VisorRelieve referenciaInicial="" obtener={crearObtener()} />);
    expect(screen.getByLabelText("Recorte")).toHaveDisplayValue("Parcela + 25 m");
    expect(screen.getByLabelText("Lado máximo de la vista")).toHaveDisplayValue("200 m");
    expect(screen.getByLabelText("Exageración vertical")).toHaveDisplayValue("×2");
  });

  it("opciones de cada selector tal como el plan", () => {
    render(<VisorRelieve referenciaInicial="" obtener={crearObtener()} />);
    const textos = (nombre: string) =>
      within(screen.getByLabelText(nombre)).getAllByRole("option").map((o) => o.textContent);
    expect(textos("Recorte")).toEqual([
      "Solo la parcela",
      "Parcela + 10 m",
      "Parcela + 25 m",
      "Parcela + 50 m",
      "Parcela + 100 m",
    ]);
    expect(textos("Lado máximo de la vista")).toEqual(["100 m", "200 m", "300 m", "500 m"]);
    expect(textos("Exageración vertical")).toEqual(["×1 (real)", "×2", "×3"]);
  });

  it("atajos «Probar con»: la de la ficha, la rústica grande y una residencial", async () => {
    const user = userEvent.setup();
    render(<VisorRelieve referenciaInicial={REF} obtener={crearObtener()} />);
    expect(screen.getByText(/Probar con/)).toBeInTheDocument();
    const campo = screen.getByLabelText("Referencia catastral");

    await user.clear(campo);
    await user.click(screen.getByRole("button", { name: /rústica/i }));
    await waitFor(() => expect(campo).toHaveValue(RUSTICA));

    await user.click(screen.getByRole("button", { name: /ficha/i }));
    await waitFor(() => expect(campo).toHaveValue(REF));

    await user.click(screen.getByRole("button", { name: /residencial/i }));
    await waitFor(() => expect((campo as HTMLInputElement).value).toMatch(/^[0-9A-Z]{20}$/));
    expect(campo).not.toHaveValue(REF);
  });
});

describe("VisorRelieve · validación y consulta", () => {
  it("referencia inválida: aviso en región viva y no se consulta", async () => {
    const user = userEvent.setup();
    const obtener = crearObtener();
    render(<VisorRelieve referenciaInicial="" obtener={obtener} />);
    await user.type(screen.getByLabelText("Referencia catastral"), "ABC");
    await user.click(screen.getByRole("button", { name: "Ver relieve" }));
    const aviso = await screen.findByText("La referencia catastral debe tener 20 caracteres.");
    expect(enRegionViva(aviso)).toBe(true);
    expect(obtener).not.toHaveBeenCalled();
    expect(montar).not.toHaveBeenCalled();
  });

  it("consulta válida: «Cargando el visor 3D…» y luego una sola escena con contenedor, relieve y exageración", async () => {
    const user = userEvent.setup();
    let resolver!: (r: Relieve) => void;
    const obtener = jest.fn(() => new Promise<Relieve>((res) => (resolver = res)));
    render(<VisorRelieve referenciaInicial="" obtener={obtener} />);
    await user.type(screen.getByLabelText("Referencia catastral"), REF);
    await user.click(screen.getByRole("button", { name: "Ver relieve" }));

    expect(await screen.findByText("Cargando el visor 3D…")).toBeInTheDocument();
    expect(obtener).toHaveBeenCalledTimes(1);
    expect(obtener).toHaveBeenCalledWith({ referencia: REF, margen: 25, ladoMaximo: 200 });

    const relieve = relieveDe({ referencia: REF, margen: 25, ladoMaximo: 200 });
    resolver(relieve);
    await waitFor(() => expect(montar).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText("Cargando el visor 3D…")).not.toBeInTheDocument());

    const [contenedor, rel, exageracion, colores] = montar.mock.calls[0];
    expect(contenedor).toBeInstanceOf(HTMLElement);
    expect(screen.getByRole("img", { name: new RegExp(REF) }).contains(contenedor)).toBe(true);
    expect(rel).toEqual(relieve);
    expect(exageracion).toBe(2);
    expect(colores).toEqual({ fondo: expect.any(String), acento: expect.any(String), borde: expect.any(String) });
  });

  it("el lienzo es una imagen accesible, enfocable y con ayuda de teclado", async () => {
    const user = userEvent.setup();
    render(<VisorRelieve referenciaInicial="" obtener={crearObtener()} />);
    await ver(user, REF);
    const lienzo = screen.getByRole("img", { name: `Relieve 3D del terreno de ${REF}` });
    expect(lienzo).toHaveAttribute("tabindex", "0");
    expect(screen.getByText(/Usa las flechas para girar; los botones \+ y − acercan y alejan/)).toBeInTheDocument();
  });

  it("error de la consulta: aviso en región viva, sin escena y sin romper los controles", async () => {
    const user = userEvent.setup();
    const obtener = jest.fn().mockRejectedValue(new Error("Servicio no disponible"));
    const { container } = render(<VisorRelieve referenciaInicial="" obtener={obtener} />);
    await user.type(screen.getByLabelText("Referencia catastral"), REF);
    await user.click(screen.getByRole("button", { name: "Ver relieve" }));
    await waitFor(() => {
      const vivas = Array.from(container.querySelectorAll('[aria-live], [role="alert"], [role="status"]'));
      expect(vivas.some((r) => (r.textContent ?? "").trim() !== "")).toBe(true);
    });
    expect(montar).not.toHaveBeenCalled();
    expect(screen.queryByText("Cargando el visor 3D…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver relieve" })).toBeEnabled();
  });
});

describe("VisorRelieve · lecturas y avisos", () => {
  it("lecturas dentro de la parcela visible, coherentes con calcularLecturas", async () => {
    const user = userEvent.setup();
    render(<VisorRelieve referenciaInicial="" obtener={crearObtener()} />);
    await ver(user, REF);
    const esperadas = calcularLecturas(relieveDe({ referencia: REF, margen: 25, ladoMaximo: 200 }))!;

    const [min, max] = numeros(valorDe("Altitud en la parcela"));
    expect(min).toBeCloseTo(esperadas.alturaMin, 0);
    expect(max).toBeCloseTo(esperadas.alturaMax, 0);
    expect(numeros(valorDe("Desnivel"))[0]).toBeCloseTo(esperadas.desnivel, 0);
    expect(numeros(valorDe("Pendiente media"))[0]).toBeCloseTo(esperadas.pendienteMedia, 0);
    expect(valorDe("Pendiente media")).toMatch(/%/);
    expect(numeros(valorDe("Superficie del polígono"))[0]).toBe(123456);
    expect(valorDe("Superficie del polígono")).toMatch(/m²/);
    expect(numeros(valorDe("Vista"))).toEqual([100, 100]);
    expect(valorDe("Vista")).toMatch(/m/);
    expect(numeros(valorDe("Relieve"))[0]).toBe(2);
    expect(valorDe("Relieve")).toMatch(/×2/);
  });

  it("avisos fijos: orientativo y la fuente; sin avisos de recorte cuando no corresponden", async () => {
    const user = userEvent.setup();
    render(<VisorRelieve referenciaInicial="" obtener={crearObtener()} />);
    await ver(user, REF);
    expect(screen.getByText(/Orientativo: no sustituye un levantamiento topográfico\./)).toBeInTheDocument();
    expect(screen.getByText(/Fuente de prueba \(ficticia\)/)).toBeInTheDocument();
    expect(screen.queryByText("Parcela mayor que la ventana: se muestra centrada en su centroide.")).not.toBeInTheDocument();
    expect(screen.queryByText("El borde se corta en el límite de la vista.")).not.toBeInTheDocument();
  });

  it("recortada: avisa de que la parcela se muestra centrada en su centroide", async () => {
    const user = userEvent.setup();
    render(<VisorRelieve referenciaInicial="" obtener={crearObtener({ recortada: true })} />);
    await ver(user, RUSTICA);
    expect(screen.getByText(/Parcela mayor que la ventana: se muestra centrada en su centroide\./)).toBeInTheDocument();
    expect(screen.queryByText("El borde se corta en el límite de la vista.")).not.toBeInTheDocument();
  });

  it("parcelaCortada: avisa de que el borde se corta en el límite de la vista", async () => {
    const user = userEvent.setup();
    render(<VisorRelieve referenciaInicial="" obtener={crearObtener({ parcelaCortada: true })} />);
    await ver(user, RUSTICA);
    expect(screen.getByText(/El borde se corta en el límite de la vista\./)).toBeInTheDocument();
    expect(screen.queryByText("Parcela mayor que la ventana: se muestra centrada en su centroide.")).not.toBeInTheDocument();
  });

  it("sigue mostrando el aviso orientativo con ambos avisos de recorte", async () => {
    const user = userEvent.setup();
    render(<VisorRelieve referenciaInicial="" obtener={crearObtener({ recortada: true, parcelaCortada: true })} />);
    await ver(user, RUSTICA);
    expect(screen.getByText(/Parcela mayor que la ventana/)).toBeInTheDocument();
    expect(screen.getByText(/El borde se corta en el límite de la vista/)).toBeInTheDocument();
    expect(screen.getByText(/Orientativo: no sustituye un levantamiento topográfico\./)).toBeInTheDocument();
  });
});

describe("VisorRelieve · controles con relieve mostrado", () => {
  it("cambiar «Recorte» vuelve a consultar con las nuevas opciones y libera la escena anterior antes de montar otra", async () => {
    const user = userEvent.setup();
    const obtener = crearObtener();
    render(<VisorRelieve referenciaInicial="" obtener={obtener} />);
    await ver(user, REF);
    await user.selectOptions(screen.getByLabelText("Recorte"), "Parcela + 50 m");
    await waitFor(() => expect(montar).toHaveBeenCalledTimes(2));
    expect(obtener).toHaveBeenLastCalledWith({ referencia: REF, margen: 50, ladoMaximo: 200 });
    expect(escenas[0].liberar).toHaveBeenCalledTimes(1);
    expect(escenas[0].liberar.mock.invocationCallOrder[0]).toBeLessThan(montar.mock.invocationCallOrder[1]);
    expect(escenas[1].liberar).not.toHaveBeenCalled();
  });

  it("cambiar «Lado máximo de la vista» vuelve a consultar y libera la anterior", async () => {
    const user = userEvent.setup();
    const obtener = crearObtener();
    render(<VisorRelieve referenciaInicial="" obtener={obtener} />);
    await ver(user, REF);
    await user.selectOptions(screen.getByLabelText("Lado máximo de la vista"), "300 m");
    await waitFor(() => expect(montar).toHaveBeenCalledTimes(2));
    expect(obtener).toHaveBeenLastCalledWith({ referencia: REF, margen: 25, ladoMaximo: 300 });
    expect(escenas[0].liberar).toHaveBeenCalledTimes(1);
  });

  it("cambiar «Exageración vertical» solo reescala: no consulta ni monta otra escena", async () => {
    const user = userEvent.setup();
    const obtener = crearObtener();
    render(<VisorRelieve referenciaInicial="" obtener={obtener} />);
    await ver(user, REF);
    await user.selectOptions(screen.getByLabelText("Exageración vertical"), "×3");
    expect(escenas[0].actualizarExageracion).toHaveBeenCalledWith(3);
    expect(obtener).toHaveBeenCalledTimes(1);
    expect(montar).toHaveBeenCalledTimes(1);
    expect(escenas[0].liberar).not.toHaveBeenCalled();
    expect(numeros(valorDe("Relieve"))[0]).toBe(3);
  });

  it("«Restablecer», «Acercar» y «Alejar» actúan sobre la escena", async () => {
    const user = userEvent.setup();
    render(<VisorRelieve referenciaInicial="" obtener={crearObtener()} />);
    await ver(user, REF);
    await user.click(screen.getByRole("button", { name: "Restablecer vista" }));
    await user.click(screen.getByRole("button", { name: "Acercar" }));
    await user.click(screen.getByRole("button", { name: "Acercar" }));
    await user.click(screen.getByRole("button", { name: "Alejar" }));
    expect(escenas[0].reiniciar).toHaveBeenCalledTimes(1);
    expect(escenas[0].acercar).toHaveBeenCalledTimes(2);
    expect(escenas[0].alejar).toHaveBeenCalledTimes(1);
  });

  it("pedir otra referencia libera la escena anterior antes de montar la nueva", async () => {
    const user = userEvent.setup();
    const obtener = crearObtener();
    render(<VisorRelieve referenciaInicial="" obtener={obtener} />);
    await ver(user, REF);
    await ver(user, REF2, 2);
    expect(obtener).toHaveBeenLastCalledWith({ referencia: REF2, margen: 25, ladoMaximo: 200 });
    expect(escenas[0].liberar).toHaveBeenCalledTimes(1);
    expect(escenas[0].liberar.mock.invocationCallOrder[0]).toBeLessThan(montar.mock.invocationCallOrder[1]);
    expect(screen.getByRole("img", { name: new RegExp(REF2) })).toBeInTheDocument();
  });
});

describe("VisorRelieve · liberación de recursos", () => {
  it("desmontar el componente llama a liberar exactamente una vez", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<VisorRelieve referenciaInicial="" obtener={crearObtener()} />);
    await ver(user, REF);
    expect(escenas[0].liberar).not.toHaveBeenCalled();
    unmount();
    expect(escenas[0].liberar).toHaveBeenCalledTimes(1);
  });

  it("tras varias escenas, al desmontar cada una se ha liberado exactamente una vez", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<VisorRelieve referenciaInicial="" obtener={crearObtener()} />);
    await ver(user, REF);
    await user.selectOptions(screen.getByLabelText("Recorte"), "Solo la parcela");
    await waitFor(() => expect(montar).toHaveBeenCalledTimes(2));
    unmount();
    expect(escenas).toHaveLength(2);
    for (const e of escenas) expect(e.liberar).toHaveBeenCalledTimes(1);
  });

  it("desmontar mientras se consulta no deja ninguna escena sin liberar", async () => {
    const user = userEvent.setup();
    let resolver!: (r: Relieve) => void;
    const obtener = jest.fn(() => new Promise<Relieve>((res) => (resolver = res)));
    const { unmount } = render(<VisorRelieve referenciaInicial="" obtener={obtener} />);
    await user.type(screen.getByLabelText("Referencia catastral"), REF);
    await user.click(screen.getByRole("button", { name: "Ver relieve" }));
    await screen.findByText("Cargando el visor 3D…");
    unmount();
    resolver(relieveDe({ referencia: REF, margen: 25, ladoMaximo: 200 }));
    await new Promise((r) => setTimeout(r, 50));
    expect(escenas.every((e) => e.liberar.mock.calls.length === 1)).toBe(true);
  });
});

describe("VisorRelieve · sin WebGL", () => {
  beforeEach(() => {
    montar.mockReset();
    montar.mockImplementation(() => {
      throw new Error("WebGL no disponible");
    });
  });

  it("muestra el mensaje y los controles siguen disponibles", async () => {
    const user = userEvent.setup();
    render(<VisorRelieve referenciaInicial="" obtener={crearObtener()} />);
    await user.type(screen.getByLabelText("Referencia catastral"), REF);
    await user.click(screen.getByRole("button", { name: "Ver relieve" }));
    expect(await screen.findByText(MENSAJE_SIN_WEBGL)).toBeInTheDocument();
    expect(screen.queryByText("Cargando el visor 3D…")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Referencia catastral")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ver relieve" })).toBeEnabled();
    expect(screen.getByLabelText("Recorte")).toBeEnabled();
    expect(screen.getByLabelText("Exageración vertical")).toBeEnabled();
  });

  it("se puede volver a intentar con otra referencia sin que la página se rompa", async () => {
    const user = userEvent.setup();
    render(<VisorRelieve referenciaInicial="" obtener={crearObtener()} />);
    await user.type(screen.getByLabelText("Referencia catastral"), REF);
    await user.click(screen.getByRole("button", { name: "Ver relieve" }));
    await screen.findByText(MENSAJE_SIN_WEBGL);
    montar.mockImplementation((() => nuevaEscena()) as unknown as typeof montarEscena);
    await ver(user, REF2, montar.mock.calls.length + 1);
    await waitFor(() => expect(screen.queryByText(MENSAJE_SIN_WEBGL)).not.toBeInTheDocument());
  });
});

describe("VisorRelieve · accesibilidad", () => {
  it("cada control tiene su etiqueta asociada", () => {
    render(<VisorRelieve referenciaInicial="" obtener={crearObtener()} />);
    for (const nombre of ["Referencia catastral", "Recorte", "Lado máximo de la vista", "Exageración vertical"]) {
      expect(screen.getByLabelText(nombre)).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Referencia catastral").tagName).toBe("INPUT");
    for (const nombre of ["Recorte", "Lado máximo de la vista", "Exageración vertical"]) {
      expect(screen.getByLabelText(nombre).tagName).toBe("SELECT");
    }
  });

  it("sin violaciones de axe en el estado inicial", async () => {
    const { container } = render(<main><VisorRelieve referenciaInicial="" obtener={crearObtener()} /></main>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("sin violaciones de axe con el relieve mostrado", async () => {
    const user = userEvent.setup();
    const { container } = render(<main><VisorRelieve referenciaInicial="" obtener={crearObtener({ recortada: true, parcelaCortada: true })} /></main>);
    await ver(user, REF);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("sin violaciones de axe en el estado sin WebGL", async () => {
    montar.mockReset();
    montar.mockImplementation(() => {
      throw new Error("WebGL no disponible");
    });
    const user = userEvent.setup();
    const { container } = render(<main><VisorRelieve referenciaInicial="" obtener={crearObtener()} /></main>);
    await user.type(screen.getByLabelText("Referencia catastral"), REF);
    await user.click(screen.getByRole("button", { name: "Ver relieve" }));
    await screen.findByText(MENSAJE_SIN_WEBGL);
    expect(await axe(container)).toHaveNoViolations();
  });
});
