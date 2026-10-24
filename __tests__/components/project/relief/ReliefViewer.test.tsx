import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { ReliefViewer } from "@/components/project/relief/ReliefViewer";
import { mountScene } from "@/lib/relief-scene";
import { calculateReadings } from "@/lib/relief-readings";
import type { ReliefOptions, Relief } from "@/lib/relief";
import { slopedPlane } from "../../../helpers/relief-plane";

// jsdom has no WebGL: the scene (the only module that imports three) is replaced by a fake one.
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

/** Types a reference and presses «Ver relieve»; waits for the scene to mount. */
async function viewRelief(user: ReturnType<typeof userEvent.setup>, reference: string, expectedCalls = mount.mock.calls.length + 1) {
  const field = screen.getByLabelText("Referencia catastral");
  await user.clear(field);
  await user.type(field, reference);
  await user.click(screen.getByRole("button", { name: "Ver relieve" }));
  await waitFor(() => expect(mount).toHaveBeenCalledTimes(expectedCalls));
}

/** Text of the reading whose label is exactly `label` (works for dl/dt/dd and for span/b pairs). */
function readingValue(label: string): string {
  const el = screen.getByText(label);
  if (el.tagName === "DT" && el.nextElementSibling) return el.nextElementSibling.textContent ?? "";
  return (el.parentElement?.textContent ?? "").replace(label, "");
}
/** Numbers in a text with es-ES formatting (optional thousands separator, decimal comma). */
function numbers(text: string): number[] {
  return (text.replace(/(\d)[.\s ](?=\d{3}(?!\d))/g, "$1").match(/\d+(?:,\d+)?/g) ?? []).map((n) =>
    parseFloat(n.replace(",", ".")),
  );
}
const inLiveRegion = (el: HTMLElement) => el.closest('[aria-live], [role="alert"], [role="status"]') !== null;

describe("ReliefViewer · initial state", () => {
  it("shows the field with the initial reference and the «Ver relieve» button", () => {
    render(<ReliefViewer initialReference={REF} fetcher={makeFetcher()} />);
    expect(screen.getByRole("heading", { name: "Relieve 3D del terreno" })).toBeInTheDocument();
    expect(screen.getByLabelText("Referencia catastral")).toHaveValue(REF);
    expect(screen.getByRole("button", { name: "Ver relieve" })).toBeEnabled();
  });

  it("without a reference: guide message and nothing queried", () => {
    const fetcher = makeFetcher();
    render(<ReliefViewer initialReference="" fetcher={fetcher} />);
    expect(screen.getByText(NO_REFERENCE_MESSAGE)).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
    expect(mount).not.toHaveBeenCalled();
  });

  it("default values: Parcela + 25 m, 200 m and ×2", () => {
    render(<ReliefViewer initialReference="" fetcher={makeFetcher()} />);
    expect(screen.getByLabelText("Recorte")).toHaveDisplayValue("Parcela + 25 m");
    expect(screen.getByLabelText("Lado máximo de la vista")).toHaveDisplayValue("200 m");
    expect(screen.getByLabelText("Exageración vertical")).toHaveDisplayValue("×2");
  });

  it("options of each selector as in the plan", () => {
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

  it("«Probar con» shortcuts: the sheet's, the large rural one and a residential one", async () => {
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

describe("ReliefViewer · validation and query", () => {
  it("invalid reference: notice in a live region and no query", async () => {
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

  it("valid query: «Cargando el visor 3D…» and then a single scene with host, relief and exaggeration", async () => {
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

  it("the canvas is an accessible, focusable image with keyboard help", async () => {
    const user = userEvent.setup();
    render(<ReliefViewer initialReference="" fetcher={makeFetcher()} />);
    await viewRelief(user, REF);
    const canvasHost = screen.getByRole("img", { name: `Relieve 3D del terreno de ${REF}` });
    expect(canvasHost).toHaveAttribute("tabindex", "0");
    expect(screen.getByText(/Usa las flechas para girar; los botones \+ y − acercan y alejan/)).toBeInTheDocument();
  });

  it("query error: notice in a live region, no scene and controls not broken", async () => {
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

describe("ReliefViewer · readings and notices", () => {
  it("readings inside the visible plot, consistent with calculateReadings", async () => {
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

  it("fixed notices: indicative and the source; no clipping notices when they do not apply", async () => {
    const user = userEvent.setup();
    render(<ReliefViewer initialReference="" fetcher={makeFetcher()} />);
    await viewRelief(user, REF);
    expect(screen.getByText(/Orientativo: no sustituye un levantamiento topográfico\./)).toBeInTheDocument();
    expect(screen.getByText(/Test source \(fictitious\)/)).toBeInTheDocument();
    expect(screen.queryByText("Parcela mayor que la ventana: se muestra centrada en su centroide.")).not.toBeInTheDocument();
    expect(screen.queryByText("El borde se corta en el límite de la vista.")).not.toBeInTheDocument();
  });

  it("clamped: warns that the plot is shown centred on its centroid", async () => {
    const user = userEvent.setup();
    render(<ReliefViewer initialReference="" fetcher={makeFetcher({ clamped: true })} />);
    await viewRelief(user, RURAL);
    expect(screen.getByText(/Parcela mayor que la ventana: se muestra centrada en su centroide\./)).toBeInTheDocument();
    expect(screen.queryByText("El borde se corta en el límite de la vista.")).not.toBeInTheDocument();
  });

  it("plotClipped: warns that the border is cut at the limit of the view", async () => {
    const user = userEvent.setup();
    render(<ReliefViewer initialReference="" fetcher={makeFetcher({ plotClipped: true })} />);
    await viewRelief(user, RURAL);
    expect(screen.getByText(/El borde se corta en el límite de la vista\./)).toBeInTheDocument();
    expect(screen.queryByText("Parcela mayor que la ventana: se muestra centrada en su centroide.")).not.toBeInTheDocument();
  });

  it("still shows the indicative notice with both clipping notices", async () => {
    const user = userEvent.setup();
    render(<ReliefViewer initialReference="" fetcher={makeFetcher({ clamped: true, plotClipped: true })} />);
    await viewRelief(user, RURAL);
    expect(screen.getByText(/Parcela mayor que la ventana/)).toBeInTheDocument();
    expect(screen.getByText(/El borde se corta en el límite de la vista/)).toBeInTheDocument();
    expect(screen.getByText(/Orientativo: no sustituye un levantamiento topográfico\./)).toBeInTheDocument();
  });
});

describe("ReliefViewer · controls with a relief shown", () => {
  it("changing «Recorte» queries again with the new options and releases the previous scene before mounting another", async () => {
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

  it("changing «Lado máximo de la vista» queries again and releases the previous one", async () => {
    const user = userEvent.setup();
    const fetcher = makeFetcher();
    render(<ReliefViewer initialReference="" fetcher={fetcher} />);
    await viewRelief(user, REF);
    await user.selectOptions(screen.getByLabelText("Lado máximo de la vista"), "300 m");
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(2));
    expect(fetcher).toHaveBeenLastCalledWith({ reference: REF, margin: 25, maxSide: 300 });
    expect(scenes[0].release).toHaveBeenCalledTimes(1);
  });

  it("changing «Exageración vertical» only rescales: neither queries nor mounts another scene", async () => {
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

  it("«Restablecer», «Acercar» and «Alejar» act on the scene", async () => {
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

  it("requesting another reference releases the previous scene before mounting the new one", async () => {
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

describe("ReliefViewer · resource release", () => {
  it("unmounting the component calls release exactly once", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ReliefViewer initialReference="" fetcher={makeFetcher()} />);
    await viewRelief(user, REF);
    expect(scenes[0].release).not.toHaveBeenCalled();
    unmount();
    expect(scenes[0].release).toHaveBeenCalledTimes(1);
  });

  it("after several scenes, unmounting releases each one exactly once", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ReliefViewer initialReference="" fetcher={makeFetcher()} />);
    await viewRelief(user, REF);
    await user.selectOptions(screen.getByLabelText("Recorte"), "Solo la parcela");
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(2));
    unmount();
    expect(scenes).toHaveLength(2);
    for (const e of scenes) expect(e.release).toHaveBeenCalledTimes(1);
  });

  it("unmounting while querying leaves no scene unreleased", async () => {
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

describe("ReliefViewer · without WebGL", () => {
  beforeEach(() => {
    mount.mockReset();
    mount.mockImplementation(() => {
      throw new Error("WebGL no disponible");
    });
  });

  it("shows the message and the controls remain available", async () => {
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

  it("can retry with another reference without the page breaking", async () => {
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

describe("ReliefViewer · accessibility", () => {
  it("each control has its associated label", () => {
    render(<ReliefViewer initialReference="" fetcher={makeFetcher()} />);
    for (const name of ["Referencia catastral", "Recorte", "Lado máximo de la vista", "Exageración vertical"]) {
      expect(screen.getByLabelText(name)).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Referencia catastral").tagName).toBe("INPUT");
    for (const name of ["Recorte", "Lado máximo de la vista", "Exageración vertical"]) {
      expect(screen.getByLabelText(name).tagName).toBe("SELECT");
    }
  });

  it("no axe violations in the initial state", async () => {
    const { container } = render(<main><ReliefViewer initialReference="" fetcher={makeFetcher()} /></main>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("no axe violations with the relief shown", async () => {
    const user = userEvent.setup();
    const { container } = render(<main><ReliefViewer initialReference="" fetcher={makeFetcher({ clamped: true, plotClipped: true })} /></main>);
    await viewRelief(user, REF);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("no axe violations in the no-WebGL state", async () => {
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
