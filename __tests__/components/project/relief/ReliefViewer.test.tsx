import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { ReliefViewer } from "@/components/project/relief/ReliefViewer";
import { mountScene } from "@/lib/relief-scene";
import { calculateReadings } from "@/lib/relief-readings";
import type { ReliefOptions, Relief } from "@/lib/relief";
import { slopedPlane } from "../../../helpers/relief-plane";

// jsdom no tiene WebGL: la escena (único módulo que importa three) se sustituye por una falsa.
jest.mock("@/lib/relief-scene", () => ({ mountScene: jest.fn() }));

jest.setTimeout(20000);

const REF = "1234567DG3413S0001AB";
const REF2 = "7654321DG3413S0001ZZ";
const RURAL = "08187A005001230000OK";
const NO_REFERENCE_MESSAGE = "Escribe una referencia catastral de 20 caracteres y pulsa «Ver relieve».";
const NO_WEBGL_MESSAGE = "Este navegador no puede mostrar el modelo 3D (WebGL no disponible).";

const mount = mountScene as jest.MockedFunction<typeof mountScene>;

type FakeScene = {
  reset: jest.Mock;
  zoomIn: jest.Mock;
  zoomOut: jest.Mock;
  updateExaggeration: jest.Mock;
  release: jest.Mock;
};
let scenes: FakeScene[];

function nextScene(): FakeScene {
  const e = {
    reset: jest.fn(),
    zoomIn: jest.fn(),
    zoomOut: jest.fn(),
    updateExaggeration: jest.fn(),
    release: jest.fn(),
  };
  scenes.push(e);
  return e;
}

const reliefOf = (o: ReliefOptions, extra: Partial<Relief> = {}) => slopedPlane({ reference: o.reference, ...extra });
const makeFetcher = (extra: Partial<Relief> = {}) => jest.fn(async (o: ReliefOptions) => reliefOf(o, extra));

beforeEach(() => {
  scenes = [];
  mount.mockReset();
  mount.mockImplementation((() => nextScene()) as unknown as typeof mountScene);
});

/** Escribe una referencia y pulsa «Ver relieve»; espera a que se monte la escena. */
async function viewRelief(user: ReturnType<typeof userEvent.setup>, reference: string, expectedCalls = mount.mock.calls.length + 1) {
  const field = screen.getByLabelText("Referencia catastral");
  await user.clear(field);
  await user.type(field, reference);
  await user.click(screen.getByRole("button", { name: "Ver relieve" }));
  await waitFor(() => expect(mount).toHaveBeenCalledTimes(expectedCalls));
}

/** Texto de la lectura cuya etiqueta es exactamente `etiqueta` (sirve para dl/dt/dd y para pares span/b). */
function readingValue(label: string): string {
  const el = screen.getByText(label);
  if (el.tagName === "DT" && el.nextElementSibling) return el.nextElementSibling.textContent ?? "";
  return (el.parentElement?.textContent ?? "").replace(label, "");
}
/** Números de un texto con formato es-ES (separador de miles opcional, coma decimal). */
function numbers(text: string): number[] {
  return (text.replace(/(\d)[.\s ](?=\d{3}(?!\d))/g, "$1").match(/\d+(?:,\d+)?/g) ?? []).map((n) =>
    parseFloat(n.replace(",", ".")),
  );
}
const inLiveRegion = (el: HTMLElement) => el.closest('[aria-live], [role="alert"], [role="status"]') !== null;

describe("VisorRelieve · estado inicial", () => {
  it("muestra el campo con la referencia inicial y el botón «Ver relieve»", () => {
    render(<ReliefViewer initialReference={REF} fetcher={makeFetcher()} />);
    expect(screen.getByRole("heading", { name: "Relieve 3D del terreno" })).toBeInTheDocument();
    expect(screen.getByLabelText("Referencia catastral")).toHaveValue(REF);
    expect(screen.getByRole("button", { name: "Ver relieve" })).toBeEnabled();
  });

  it("sin referencia: mensaje guía y nada consultado", () => {
    const fetcher = makeFetcher();
    render(<ReliefViewer initialReference="" fetcher={fetcher} />);
    expect(screen.getByText(NO_REFERENCE_MESSAGE)).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
    expect(mount).not.toHaveBeenCalled();
  });

  it("valores por defecto: Parcela + 25 m, 200 m y ×2", () => {
    render(<ReliefViewer initialReference="" fetcher={makeFetcher()} />);
    expect(screen.getByLabelText("Recorte")).toHaveDisplayValue("Parcela + 25 m");
    expect(screen.getByLabelText("Lado máximo de la vista")).toHaveDisplayValue("200 m");
    expect(screen.getByLabelText("Exageración vertical")).toHaveDisplayValue("×2");
  });

  it("opciones de cada selector tal como el plan", () => {
    render(<ReliefViewer initialReference="" fetcher={makeFetcher()} />);
    const texts = (name: string) =>
      within(screen.getByLabelText(name)).getAllByRole("option").map((o) => o.textContent);
    expect(texts("Recorte")).toEqual([
      "Solo la parcela",
      "Parcela + 10 m",
      "Parcela + 25 m",
      "Parcela + 50 m",
      "Parcela + 100 m",
    ]);
    expect(texts("Lado máximo de la vista")).toEqual(["100 m", "200 m", "300 m", "500 m"]);
    expect(texts("Exageración vertical")).toEqual(["×1 (real)", "×2", "×3"]);
  });

  it("atajos «Probar con»: la de la ficha, la rústica grande y una residencial", async () => {
    const user = userEvent.setup();
    render(<ReliefViewer initialReference={REF} fetcher={makeFetcher()} />);
    expect(screen.getByText(/Probar con/)).toBeInTheDocument();
    const field = screen.getByLabelText("Referencia catastral");

    await user.clear(field);
    await user.click(screen.getByRole("button", { name: /rústica/i }));
    await waitFor(() => expect(field).toHaveValue(RURAL));

    await user.click(screen.getByRole("button", { name: /ficha/i }));
    await waitFor(() => expect(field).toHaveValue(REF));

    await user.click(screen.getByRole("button", { name: /residencial/i }));
    await waitFor(() => expect((field as HTMLInputElement).value).toMatch(/^[0-9A-Z]{20}$/));
    expect(field).not.toHaveValue(REF);
  });
});

describe("VisorRelieve · validación y consulta", () => {
  it("referencia inválida: aviso en región viva y no se consulta", async () => {
    const user = userEvent.setup();
    const fetcher = makeFetcher();
    render(<ReliefViewer initialReference="" fetcher={fetcher} />);
    await user.type(screen.getByLabelText("Referencia catastral"), "ABC");
    await user.click(screen.getByRole("button", { name: "Ver relieve" }));
    const notice = await screen.findByText("La referencia catastral debe tener 20 caracteres.");
    expect(inLiveRegion(notice)).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
    expect(mount).not.toHaveBeenCalled();
  });

  it("consulta válida: «Cargando el visor 3D…» y luego una sola escena con contenedor, relieve y exageración", async () => {
    const user = userEvent.setup();
    let resolveFetch!: (r: Relief) => void;
    const fetcher = jest.fn(() => new Promise<Relief>((res) => (resolveFetch = res)));
    render(<ReliefViewer initialReference="" fetcher={fetcher} />);
    await user.type(screen.getByLabelText("Referencia catastral"), REF);
    await user.click(screen.getByRole("button", { name: "Ver relieve" }));

    expect(await screen.findByText("Cargando el visor 3D…")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith({ reference: REF, margin: 25, maxSide: 200 });

    const relief = reliefOf({ reference: REF, margin: 25, maxSide: 200 });
    resolveFetch(relief);
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText("Cargando el visor 3D…")).not.toBeInTheDocument());

    const [host, rel, exaggeration, colors] = mount.mock.calls[0];
    expect(host).toBeInstanceOf(HTMLElement);
    expect(screen.getByRole("img", { name: new RegExp(REF) }).contains(host)).toBe(true);
    expect(rel).toEqual(relief);
    expect(exaggeration).toBe(2);
    expect(colors).toEqual({ background: expect.any(String), accent: expect.any(String), border: expect.any(String) });
  });

  it("el lienzo es una imagen accesible, enfocable y con ayuda de teclado", async () => {
    const user = userEvent.setup();
    render(<ReliefViewer initialReference="" fetcher={makeFetcher()} />);
    await viewRelief(user, REF);
    const canvasHost = screen.getByRole("img", { name: `Relieve 3D del terreno de ${REF}` });
    expect(canvasHost).toHaveAttribute("tabindex", "0");
    expect(screen.getByText(/Usa las flechas para girar; los botones \+ y − acercan y alejan/)).toBeInTheDocument();
  });

  it("error de la consulta: aviso en región viva, sin escena y sin romper los controles", async () => {
    const user = userEvent.setup();
    const fetcher = jest.fn().mockRejectedValue(new Error("Servicio no disponible"));
    const { container } = render(<ReliefViewer initialReference="" fetcher={fetcher} />);
    await user.type(screen.getByLabelText("Referencia catastral"), REF);
    await user.click(screen.getByRole("button", { name: "Ver relieve" }));
    await waitFor(() => {
      const liveRegions = Array.from(container.querySelectorAll('[aria-live], [role="alert"], [role="status"]'));
      expect(liveRegions.some((r) => (r.textContent ?? "").trim() !== "")).toBe(true);
    });
    expect(mount).not.toHaveBeenCalled();
    expect(screen.queryByText("Cargando el visor 3D…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver relieve" })).toBeEnabled();
  });
});

describe("VisorRelieve · lecturas y avisos", () => {
  it("lecturas dentro de la parcela visible, coherentes con calcularLecturas", async () => {
    const user = userEvent.setup();
    render(<ReliefViewer initialReference="" fetcher={makeFetcher()} />);
    await viewRelief(user, REF);
    const expectedCalls = calculateReadings(reliefOf({ reference: REF, margin: 25, maxSide: 200 }))!;

    const [min, max] = numbers(readingValue("Altitud en la parcela"));
    expect(min).toBeCloseTo(expectedCalls.minHeight, 0);
    expect(max).toBeCloseTo(expectedCalls.maxHeight, 0);
    expect(numbers(readingValue("Desnivel"))[0]).toBeCloseTo(expectedCalls.elevationRange, 0);
    expect(numbers(readingValue("Pendiente media"))[0]).toBeCloseTo(expectedCalls.meanSlope, 0);
    expect(readingValue("Pendiente media")).toMatch(/%/);
    expect(numbers(readingValue("Superficie del polígono"))[0]).toBe(123456);
    expect(readingValue("Superficie del polígono")).toMatch(/m²/);
    expect(numbers(readingValue("Vista"))).toEqual([100, 100]);
    expect(readingValue("Vista")).toMatch(/m/);
    expect(numbers(readingValue("Relieve"))[0]).toBe(2);
    expect(readingValue("Relieve")).toMatch(/×2/);
  });

  it("avisos fijos: orientativo y la fuente; sin avisos de recorte cuando no corresponden", async () => {
    const user = userEvent.setup();
    render(<ReliefViewer initialReference="" fetcher={makeFetcher()} />);
    await viewRelief(user, REF);
    expect(screen.getByText(/Orientativo: no sustituye un levantamiento topográfico\./)).toBeInTheDocument();
    expect(screen.getByText(/Fuente de prueba \(ficticia\)/)).toBeInTheDocument();
    expect(screen.queryByText("Parcela mayor que la ventana: se muestra centrada en su centroide.")).not.toBeInTheDocument();
    expect(screen.queryByText("El borde se corta en el límite de la vista.")).not.toBeInTheDocument();
  });

  it("recortada: avisa de que la parcela se muestra centrada en su centroide", async () => {
    const user = userEvent.setup();
    render(<ReliefViewer initialReference="" fetcher={makeFetcher({ clamped: true })} />);
    await viewRelief(user, RURAL);
    expect(screen.getByText(/Parcela mayor que la ventana: se muestra centrada en su centroide\./)).toBeInTheDocument();
    expect(screen.queryByText("El borde se corta en el límite de la vista.")).not.toBeInTheDocument();
  });

  it("parcelaCortada: avisa de que el borde se corta en el límite de la vista", async () => {
    const user = userEvent.setup();
    render(<ReliefViewer initialReference="" fetcher={makeFetcher({ plotClipped: true })} />);
    await viewRelief(user, RURAL);
    expect(screen.getByText(/El borde se corta en el límite de la vista\./)).toBeInTheDocument();
    expect(screen.queryByText("Parcela mayor que la ventana: se muestra centrada en su centroide.")).not.toBeInTheDocument();
  });

  it("sigue mostrando el aviso orientativo con ambos avisos de recorte", async () => {
    const user = userEvent.setup();
    render(<ReliefViewer initialReference="" fetcher={makeFetcher({ clamped: true, plotClipped: true })} />);
    await viewRelief(user, RURAL);
    expect(screen.getByText(/Parcela mayor que la ventana/)).toBeInTheDocument();
    expect(screen.getByText(/El borde se corta en el límite de la vista/)).toBeInTheDocument();
    expect(screen.getByText(/Orientativo: no sustituye un levantamiento topográfico\./)).toBeInTheDocument();
  });
});

describe("VisorRelieve · controles con relieve mostrado", () => {
  it("cambiar «Recorte» vuelve a consultar con las nuevas opciones y libera la escena anterior antes de montar otra", async () => {
    const user = userEvent.setup();
    const fetcher = makeFetcher();
    render(<ReliefViewer initialReference="" fetcher={fetcher} />);
    await viewRelief(user, REF);
    await user.selectOptions(screen.getByLabelText("Recorte"), "Parcela + 50 m");
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(2));
    expect(fetcher).toHaveBeenLastCalledWith({ reference: REF, margin: 50, maxSide: 200 });
    expect(scenes[0].release).toHaveBeenCalledTimes(1);
    expect(scenes[0].release.mock.invocationCallOrder[0]).toBeLessThan(mount.mock.invocationCallOrder[1]);
    expect(scenes[1].release).not.toHaveBeenCalled();
  });

  it("cambiar «Lado máximo de la vista» vuelve a consultar y libera la anterior", async () => {
    const user = userEvent.setup();
    const fetcher = makeFetcher();
    render(<ReliefViewer initialReference="" fetcher={fetcher} />);
    await viewRelief(user, REF);
    await user.selectOptions(screen.getByLabelText("Lado máximo de la vista"), "300 m");
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(2));
    expect(fetcher).toHaveBeenLastCalledWith({ reference: REF, margin: 25, maxSide: 300 });
    expect(scenes[0].release).toHaveBeenCalledTimes(1);
  });

  it("cambiar «Exageración vertical» solo reescala: no consulta ni monta otra escena", async () => {
    const user = userEvent.setup();
    const fetcher = makeFetcher();
    render(<ReliefViewer initialReference="" fetcher={fetcher} />);
    await viewRelief(user, REF);
    await user.selectOptions(screen.getByLabelText("Exageración vertical"), "×3");
    expect(scenes[0].updateExaggeration).toHaveBeenCalledWith(3);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(mount).toHaveBeenCalledTimes(1);
    expect(scenes[0].release).not.toHaveBeenCalled();
    expect(numbers(readingValue("Relieve"))[0]).toBe(3);
  });

  it("«Restablecer», «Acercar» y «Alejar» actúan sobre la escena", async () => {
    const user = userEvent.setup();
    render(<ReliefViewer initialReference="" fetcher={makeFetcher()} />);
    await viewRelief(user, REF);
    await user.click(screen.getByRole("button", { name: "Restablecer vista" }));
    await user.click(screen.getByRole("button", { name: "Acercar" }));
    await user.click(screen.getByRole("button", { name: "Acercar" }));
    await user.click(screen.getByRole("button", { name: "Alejar" }));
    expect(scenes[0].reset).toHaveBeenCalledTimes(1);
    expect(scenes[0].zoomIn).toHaveBeenCalledTimes(2);
    expect(scenes[0].zoomOut).toHaveBeenCalledTimes(1);
  });

  it("pedir otra referencia libera la escena anterior antes de montar la nueva", async () => {
    const user = userEvent.setup();
    const fetcher = makeFetcher();
    render(<ReliefViewer initialReference="" fetcher={fetcher} />);
    await viewRelief(user, REF);
    await viewRelief(user, REF2, 2);
    expect(fetcher).toHaveBeenLastCalledWith({ reference: REF2, margin: 25, maxSide: 200 });
    expect(scenes[0].release).toHaveBeenCalledTimes(1);
    expect(scenes[0].release.mock.invocationCallOrder[0]).toBeLessThan(mount.mock.invocationCallOrder[1]);
    expect(screen.getByRole("img", { name: new RegExp(REF2) })).toBeInTheDocument();
  });
});

describe("VisorRelieve · liberación de recursos", () => {
  it("desmontar el componente llama a liberar exactamente una vez", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ReliefViewer initialReference="" fetcher={makeFetcher()} />);
    await viewRelief(user, REF);
    expect(scenes[0].release).not.toHaveBeenCalled();
    unmount();
    expect(scenes[0].release).toHaveBeenCalledTimes(1);
  });

  it("tras varias escenas, al desmontar cada una se ha liberado exactamente una vez", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ReliefViewer initialReference="" fetcher={makeFetcher()} />);
    await viewRelief(user, REF);
    await user.selectOptions(screen.getByLabelText("Recorte"), "Solo la parcela");
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(2));
    unmount();
    expect(scenes).toHaveLength(2);
    for (const e of scenes) expect(e.release).toHaveBeenCalledTimes(1);
  });

  it("desmontar mientras se consulta no deja ninguna escena sin liberar", async () => {
    const user = userEvent.setup();
    let resolveFetch!: (r: Relief) => void;
    const fetcher = jest.fn(() => new Promise<Relief>((res) => (resolveFetch = res)));
    const { unmount } = render(<ReliefViewer initialReference="" fetcher={fetcher} />);
    await user.type(screen.getByLabelText("Referencia catastral"), REF);
    await user.click(screen.getByRole("button", { name: "Ver relieve" }));
    await screen.findByText("Cargando el visor 3D…");
    unmount();
    resolveFetch(reliefOf({ reference: REF, margin: 25, maxSide: 200 }));
    await new Promise((r) => setTimeout(r, 50));
    expect(scenes.every((e) => e.release.mock.calls.length === 1)).toBe(true);
  });
});

describe("VisorRelieve · sin WebGL", () => {
  beforeEach(() => {
    mount.mockReset();
    mount.mockImplementation(() => {
      throw new Error("WebGL no disponible");
    });
  });

  it("muestra el mensaje y los controles siguen disponibles", async () => {
    const user = userEvent.setup();
    render(<ReliefViewer initialReference="" fetcher={makeFetcher()} />);
    await user.type(screen.getByLabelText("Referencia catastral"), REF);
    await user.click(screen.getByRole("button", { name: "Ver relieve" }));
    expect(await screen.findByText(NO_WEBGL_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText("Cargando el visor 3D…")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Referencia catastral")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ver relieve" })).toBeEnabled();
    expect(screen.getByLabelText("Recorte")).toBeEnabled();
    expect(screen.getByLabelText("Exageración vertical")).toBeEnabled();
  });

  it("se puede volver a intentar con otra referencia sin que la página se rompa", async () => {
    const user = userEvent.setup();
    render(<ReliefViewer initialReference="" fetcher={makeFetcher()} />);
    await user.type(screen.getByLabelText("Referencia catastral"), REF);
    await user.click(screen.getByRole("button", { name: "Ver relieve" }));
    await screen.findByText(NO_WEBGL_MESSAGE);
    mount.mockImplementation((() => nextScene()) as unknown as typeof mountScene);
    await viewRelief(user, REF2, mount.mock.calls.length + 1);
    await waitFor(() => expect(screen.queryByText(NO_WEBGL_MESSAGE)).not.toBeInTheDocument());
  });
});

describe("VisorRelieve · accesibilidad", () => {
  it("cada control tiene su etiqueta asociada", () => {
    render(<ReliefViewer initialReference="" fetcher={makeFetcher()} />);
    for (const name of ["Referencia catastral", "Recorte", "Lado máximo de la vista", "Exageración vertical"]) {
      expect(screen.getByLabelText(name)).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Referencia catastral").tagName).toBe("INPUT");
    for (const name of ["Recorte", "Lado máximo de la vista", "Exageración vertical"]) {
      expect(screen.getByLabelText(name).tagName).toBe("SELECT");
    }
  });

  it("sin violaciones de axe en el estado inicial", async () => {
    const { container } = render(<main><ReliefViewer initialReference="" fetcher={makeFetcher()} /></main>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("sin violaciones de axe con el relieve mostrado", async () => {
    const user = userEvent.setup();
    const { container } = render(<main><ReliefViewer initialReference="" fetcher={makeFetcher({ clamped: true, plotClipped: true })} /></main>);
    await viewRelief(user, REF);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("sin violaciones de axe en el estado sin WebGL", async () => {
    mount.mockReset();
    mount.mockImplementation(() => {
      throw new Error("WebGL no disponible");
    });
    const user = userEvent.setup();
    const { container } = render(<main><ReliefViewer initialReference="" fetcher={makeFetcher()} /></main>);
    await user.type(screen.getByLabelText("Referencia catastral"), REF);
    await user.click(screen.getByRole("button", { name: "Ver relieve" }));
    await screen.findByText(NO_WEBGL_MESSAGE);
    expect(await axe(container)).toHaveNoViolations();
  });
});
