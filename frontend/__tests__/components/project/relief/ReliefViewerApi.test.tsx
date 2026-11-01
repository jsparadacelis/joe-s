/**
 * RGB-52 · the viewer connected to the relief service.
 * Contract: `<ReliefViewer projectCode initialReference fetcher? />`. Without `fetcher` it uses
 * `reliefFetcherFor(projectCode)`: real projects call the API (`@/lib/api` request), PRY-EJ-* samples use the
 * synthetic terrain and never call it.
 * Texts: loading «Cargando relieve…»; ApiError 422/404 -> the server's message next to the reference field
 * (aria-invalid + aria-describedby, live region); any other ApiError (503, network, 502) -> the server's message in
 * a live region, the reference not marked invalid; other errors -> «No se pudo obtener el relieve. Inténtalo de nuevo.»;
 * noDataCells > 0 -> «Hay celdas sin dato: se han estimado a partir de las vecinas.»; no outline -> the existing
 * «No hay parcela dentro de la vista: no se pueden calcular las lecturas.»
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { ReliefViewer } from "@/components/project/relief/ReliefViewer";
import { ApiError, request } from "@/lib/api";
import { mountScene } from "@/lib/relief-scene";
import { API_PLOT_REFERENCE, API_REFERENCE, apiReliefJson, planeGrid } from "../../../helpers/relief-api-response";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  request: jest.fn(),
}));
// jsdom has no WebGL: the scene module is replaced by a fake.
jest.mock("@/lib/relief-scene", () => ({ mountScene: jest.fn() }));

jest.setTimeout(20000);

const REAL = "PRY-2026-001";
const SAMPLE = "PRY-EJ-001";
const mount = mountScene as jest.MockedFunction<typeof mountScene>;
const api = request as unknown as jest.Mock;

type FakeScene = { reset: jest.Mock; zoomIn: jest.Mock; zoomOut: jest.Mock; updateExaggeration: jest.Mock; release: jest.Mock };
let scenes: FakeScene[];

beforeEach(() => {
  scenes = [];
  api.mockReset();
  mount.mockReset();
  mount.mockImplementation((() => {
    const scene = { reset: jest.fn(), zoomIn: jest.fn(), zoomOut: jest.fn(), updateExaggeration: jest.fn(), release: jest.fn() };
    scenes.push(scene);
    return scene;
  }) as unknown as typeof mountScene);
});

const viewButton = () => screen.getByRole("button", { name: "Ver relieve" });
const inLiveRegion = (el: HTMLElement) => el.closest('[aria-live], [role="alert"], [role="status"]') !== null;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("ReliefViewer · real project calls the API", () => {
  it("«Ver relieve» requests /api/cadastre/{reference}/relief with the default margin and side", async () => {
    const user = userEvent.setup();
    api.mockResolvedValue(apiReliefJson());
    render(<ReliefViewer projectCode={REAL} initialReference={API_REFERENCE} />);
    expect(api).not.toHaveBeenCalled();
    await user.click(viewButton());
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith(`/api/cadastre/${API_REFERENCE}/relief?margin=25&max_side=200`, { method: "GET" });
  });

  it("mounts the scene with the translated relief: server grid and perimeter, never the synthetic terrain", async () => {
    const user = userEvent.setup();
    api.mockResolvedValue(apiReliefJson());
    render(<ReliefViewer projectCode={REAL} initialReference={API_REFERENCE} />);
    await user.click(viewButton());
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    const relief = mount.mock.calls[0][1];
    expect(relief.viewWindow).toEqual([0, 0, 100, 200]);
    expect(relief.heights).toEqual([10, 11, 12, 20, 21, 22]);
    expect(relief.reference).toBe(API_REFERENCE);
    expect(relief.source).toBe("MDT 5 m, IGN");
    expect(screen.getByText(/Fuente: MDT 5 m, IGN/)).toBeInTheDocument();
    expect(screen.queryByText(/Relieve simulado/)).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: `Relieve 3D del terreno de ${API_REFERENCE}` })).toBeInTheDocument();
  });

  it("the simulated «Probar con» shortcuts are not offered for a real project (they do not exist in Catastro)", () => {
    render(<ReliefViewer projectCode={REAL} initialReference={API_REFERENCE} />);
    expect(screen.queryByRole("button", { name: /rústica/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /residencial/i })).not.toBeInTheDocument();
  });

  it("shows «Cargando relieve…» while the request is pending and hides it afterwards", async () => {
    const user = userEvent.setup();
    const pending = deferred<unknown>();
    api.mockReturnValue(pending.promise);
    render(<ReliefViewer projectCode={REAL} initialReference={API_REFERENCE} />);
    await user.click(viewButton());
    const loading = await screen.findByText("Cargando relieve…");
    expect(inLiveRegion(loading)).toBe(true);
    expect(mount).not.toHaveBeenCalled();
    pending.resolve(apiReliefJson());
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText("Cargando relieve…")).not.toBeInTheDocument());
  });

  it("an invalid reference is rejected in the browser: the API is not called", async () => {
    const user = userEvent.setup();
    render(<ReliefViewer projectCode={REAL} initialReference="" />);
    await user.type(screen.getByLabelText("Referencia catastral"), "ABC");
    await user.click(viewButton());
    expect(await screen.findByText("La referencia catastral debe tener 20 caracteres.")).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });
});

describe("ReliefViewer · sample project uses the synthetic terrain", () => {
  it("PRY-EJ-* never calls the API and shows the simulated relief", async () => {
    const user = userEvent.setup();
    render(<ReliefViewer projectCode={SAMPLE} initialReference={API_REFERENCE} />);
    await user.click(viewButton());
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    expect(api).not.toHaveBeenCalled();
    expect(screen.getByText(/Fuente: Relieve simulado/)).toBeInTheDocument();
    expect(mount.mock.calls[0][1].source).toBe("Relieve simulado");
  });

  it("keeps the simulated shortcuts", () => {
    render(<ReliefViewer projectCode={SAMPLE} initialReference={API_REFERENCE} />);
    expect(screen.getByRole("button", { name: /rústica/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /residencial/i })).toBeInTheDocument();
  });

  it("changing the margin of a sample asks the synthetic terrain again, still without the API", async () => {
    const user = userEvent.setup();
    render(<ReliefViewer projectCode={SAMPLE} initialReference={API_REFERENCE} />);
    await user.click(viewButton());
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    await user.selectOptions(screen.getByLabelText("Recorte"), "Parcela + 50 m");
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(2));
    expect(api).not.toHaveBeenCalled();
  });
});

describe("ReliefViewer · changing margin or side asks the API again", () => {
  it("«Recorte» -> margin in the URL, with the FULL 20-character reference (not the 14 of the response) and WebGL released", async () => {
    const user = userEvent.setup();
    api.mockResolvedValue(apiReliefJson());
    render(<ReliefViewer projectCode={REAL} initialReference={API_REFERENCE} />);
    await user.click(viewButton());
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    await user.selectOptions(screen.getByLabelText("Recorte"), "Parcela + 50 m");
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(2));
    expect(api).toHaveBeenCalledTimes(2);
    expect(api).toHaveBeenLastCalledWith(`/api/cadastre/${API_REFERENCE}/relief?margin=50&max_side=200`, { method: "GET" });
    expect(api.mock.calls[1][0]).not.toContain(`/${API_PLOT_REFERENCE}/`);
    expect(scenes[0].release).toHaveBeenCalledTimes(1);
    expect(scenes[0].release.mock.invocationCallOrder[0]).toBeLessThan(mount.mock.invocationCallOrder[1]);
  });

  it("«Lado máximo de la vista» -> max_side in the URL", async () => {
    const user = userEvent.setup();
    api.mockResolvedValue(apiReliefJson());
    render(<ReliefViewer projectCode={REAL} initialReference={API_REFERENCE} />);
    await user.click(viewButton());
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    await user.selectOptions(screen.getByLabelText("Lado máximo de la vista"), "500 m");
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(2));
    expect(api).toHaveBeenLastCalledWith(`/api/cadastre/${API_REFERENCE}/relief?margin=25&max_side=500`, { method: "GET" });
  });

  it("«Exageración vertical» does not ask again", async () => {
    const user = userEvent.setup();
    api.mockResolvedValue(apiReliefJson());
    render(<ReliefViewer projectCode={REAL} initialReference={API_REFERENCE} />);
    await user.click(viewButton());
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    await user.selectOptions(screen.getByLabelText("Exageración vertical"), "×3");
    expect(api).toHaveBeenCalledTimes(1);
    expect(mount).toHaveBeenCalledTimes(1);
  });
});

describe("ReliefViewer · no stale results (race between requests)", () => {
  async function twoRequests(order: "newest-first" | "oldest-first") {
    const user = userEvent.setup();
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    api.mockResolvedValueOnce(apiReliefJson()); // initial relief, to be able to change the margin
    api.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<ReliefViewer projectCode={REAL} initialReference={API_REFERENCE} />);
    await user.click(viewButton());
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    await user.selectOptions(screen.getByLabelText("Recorte"), "Parcela + 50 m"); // request A (pending)
    await user.selectOptions(screen.getByLabelText("Lado máximo de la vista"), "300 m"); // request B (pending)
    await waitFor(() => expect(api).toHaveBeenCalledTimes(3));

    const stale = apiReliefJson({ plot_area_m2: 1111, grid: planeGrid(3, 3) });
    const latest = apiReliefJson({ plot_area_m2: 2222, grid: planeGrid(4, 4) });
    if (order === "newest-first") {
      second.resolve(latest);
      await waitFor(() => expect(mount).toHaveBeenCalledTimes(2));
      first.resolve(stale);
    } else {
      first.resolve(stale);
      await new Promise((r) => setTimeout(r, 50));
      second.resolve(latest);
      await waitFor(() => expect(mount).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ polygonSurface: 2222 }), expect.anything(), expect.anything()));
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  it("a late answer to an older request does not replace the newest one", async () => {
    await twoRequests("newest-first");
    const last = mount.mock.calls[mount.mock.calls.length - 1][1];
    expect(last.polygonSurface).toBe(2222);
    expect(last.columns).toBe(4);
    expect(screen.queryByText("Cargando relieve…")).not.toBeInTheDocument();
    expect(api).toHaveBeenLastCalledWith(`/api/cadastre/${API_REFERENCE}/relief?margin=50&max_side=300`, { method: "GET" });
  });

  it("an older answer that arrives first never reaches the scene", async () => {
    await twoRequests("oldest-first");
    expect(mount.mock.calls.every(([, relief]) => relief.polygonSurface !== 1111)).toBe(true);
    expect(mount.mock.calls[mount.mock.calls.length - 1][1].polygonSurface).toBe(2222);
  });

  it("a late error of an older request does not hide the newest relief", async () => {
    const user = userEvent.setup();
    const first = deferred<unknown>();
    api.mockResolvedValueOnce(apiReliefJson());
    api.mockReturnValueOnce(first.promise).mockResolvedValueOnce(apiReliefJson({ plot_area_m2: 2222 }));
    render(<ReliefViewer projectCode={REAL} initialReference={API_REFERENCE} />);
    await user.click(viewButton());
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    await user.selectOptions(screen.getByLabelText("Recorte"), "Parcela + 50 m");
    await user.selectOptions(screen.getByLabelText("Lado máximo de la vista"), "300 m");
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(2));
    first.reject(new ApiError(503, "relief_unavailable", "No se pudo obtener el relieve. Puedes seguir sin el visor 3D."));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/No se pudo obtener el relieve/)).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Relieve 3D del terreno/ })).toBeInTheDocument();
  });

  it("unmounting while the request is in flight mounts nothing when it arrives", async () => {
    const user = userEvent.setup();
    const pending = deferred<unknown>();
    api.mockReturnValue(pending.promise);
    const { unmount } = render(<ReliefViewer projectCode={REAL} initialReference={API_REFERENCE} />);
    await user.click(viewButton());
    await screen.findByText("Cargando relieve…");
    unmount();
    pending.resolve(apiReliefJson());
    await new Promise((r) => setTimeout(r, 50));
    expect(mount).not.toHaveBeenCalled();
  });
});

describe("ReliefViewer · errors from the service", () => {
  const field = () => screen.getByLabelText("Referencia catastral");

  it.each([
    [422, "plot_reference_only", "La referencia catastral debe tener 20 caracteres, sin el sufijo."],
    [422, "invalid_cadastral_reference", "La referencia catastral no es válida."],
    [404, "plot_not_found", "No se encontró ninguna parcela con esa referencia catastral."],
  ])("%i %s: the server's message next to the reference field", async (status, code, message) => {
    const user = userEvent.setup();
    api.mockRejectedValue(new ApiError(status, code, message));
    render(<ReliefViewer projectCode={REAL} initialReference={API_REFERENCE} />);
    await user.click(viewButton());
    const notice = await screen.findByText(message);
    expect(inLiveRegion(notice)).toBe(true);
    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(field()).toHaveAccessibleDescription(message);
    expect(screen.queryByText("Cargando relieve…")).not.toBeInTheDocument();
    expect(mount).not.toHaveBeenCalled();
    expect(viewButton()).toBeEnabled();
  });

  it("503 relief_unavailable: the server's message in a live region, the field not marked invalid, controls usable", async () => {
    const user = userEvent.setup();
    const message = "No se pudo obtener el relieve. Puedes seguir sin el visor 3D.";
    api.mockRejectedValue(new ApiError(503, "relief_unavailable", message));
    render(<main><ReliefViewer projectCode={REAL} initialReference={API_REFERENCE} /></main>);
    await user.click(viewButton());
    const notice = await screen.findByText(message);
    expect(inLiveRegion(notice)).toBe(true);
    expect(field()).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText("Cargando relieve…")).not.toBeInTheDocument();
    expect(mount).not.toHaveBeenCalled();
    expect(field()).toBeEnabled();
    expect(viewButton()).toBeEnabled();
    expect(screen.getByLabelText("Recorte")).toBeEnabled();
    expect(screen.getByRole("heading", { name: "Relieve 3D del terreno" })).toBeInTheDocument();
  });

  it("503 cadastre_unavailable and a network error also show their own message", async () => {
    const user = userEvent.setup();
    api.mockRejectedValueOnce(new ApiError(503, "cadastre_unavailable", "Catastro no está disponible ahora mismo."));
    render(<ReliefViewer projectCode={REAL} initialReference={API_REFERENCE} />);
    await user.click(viewButton());
    expect(await screen.findByText("Catastro no está disponible ahora mismo.")).toBeInTheDocument();
    api.mockRejectedValueOnce(new ApiError(0, "network_error", "No se pudo conectar con el servidor."));
    await user.click(viewButton());
    expect(await screen.findByText("No se pudo conectar con el servidor.")).toBeInTheDocument();
    expect(screen.queryByText("Catastro no está disponible ahora mismo.")).not.toBeInTheDocument();
  });

  it("a malformed response shows the invalid-response message and mounts nothing", async () => {
    const user = userEvent.setup();
    api.mockResolvedValue({ unexpected: true });
    render(<ReliefViewer projectCode={REAL} initialReference={API_REFERENCE} />);
    await user.click(viewButton());
    expect(await screen.findByText("La respuesta del servidor no es válida. Inténtalo de nuevo.")).toBeInTheDocument();
    expect(mount).not.toHaveBeenCalled();
  });

  it("an unexpected non-API error keeps the generic message", async () => {
    const user = userEvent.setup();
    api.mockRejectedValue(new Error("boom"));
    render(<ReliefViewer projectCode={REAL} initialReference={API_REFERENCE} />);
    await user.click(viewButton());
    expect(await screen.findByText("No se pudo obtener el relieve. Inténtalo de nuevo.")).toBeInTheDocument();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
  });

  it("a 422 on the reference clears once a valid answer arrives, and the next error replaces the previous message", async () => {
    const user = userEvent.setup();
    api.mockRejectedValueOnce(new ApiError(404, "plot_not_found", "No se encontró ninguna parcela con esa referencia catastral."));
    api.mockResolvedValueOnce(apiReliefJson());
    render(<ReliefViewer projectCode={REAL} initialReference={API_REFERENCE} />);
    await user.click(viewButton());
    await screen.findByText("No se encontró ninguna parcela con esa referencia catastral.");
    await user.click(viewButton());
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("No se encontró ninguna parcela con esa referencia catastral.")).not.toBeInTheDocument();
    expect(field()).toHaveAttribute("aria-invalid", "false");
  });

  it("no axe violations with a reference error and with a 503", async () => {
    const user = userEvent.setup();
    api.mockRejectedValueOnce(new ApiError(404, "plot_not_found", "No se encontró ninguna parcela con esa referencia catastral."));
    const { container } = render(<main><ReliefViewer projectCode={REAL} initialReference={API_REFERENCE} /></main>);
    await user.click(viewButton());
    await screen.findByText("No se encontró ninguna parcela con esa referencia catastral.");
    expect(await axe(container)).toHaveNoViolations();
    api.mockRejectedValueOnce(new ApiError(503, "relief_unavailable", "No se pudo obtener el relieve. Puedes seguir sin el visor 3D."));
    await user.click(viewButton());
    await screen.findByText("No se pudo obtener el relieve. Puedes seguir sin el visor 3D.");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("ReliefViewer · notices from the service data", () => {
  async function show(overrides: Record<string, unknown>) {
    const user = userEvent.setup();
    api.mockResolvedValue(apiReliefJson(overrides));
    const view = render(<main><ReliefViewer projectCode={REAL} initialReference={API_REFERENCE} /></main>);
    await user.click(viewButton());
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    return view;
  }

  it("clipped -> «Parcela mayor que la ventana…»; parcel_clipped -> «El borde se corta…»", async () => {
    await show({ clipped: true, parcel_clipped: true });
    expect(screen.getByText(/Parcela mayor que la ventana: se muestra centrada en su centroide\./)).toBeInTheDocument();
    expect(screen.getByText(/El borde se corta en el límite de la vista\./)).toBeInTheDocument();
  });

  it("no clipping flags: neither notice", async () => {
    await show({});
    expect(screen.queryByText(/Parcela mayor que la ventana/)).not.toBeInTheDocument();
    expect(screen.queryByText(/El borde se corta/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hay celdas sin dato/)).not.toBeInTheDocument();
  });

  it("null cells -> «Hay celdas sin dato: se han estimado a partir de las vecinas.»", async () => {
    await show({ grid: planeGrid(4, 4, [[1, 1], [2, 2]]) });
    expect(screen.getByText("Hay celdas sin dato: se han estimado a partir de las vecinas.")).toBeInTheDocument();
  });

  it("null outline -> no readings and the «No hay parcela dentro de la vista» notice; the terrain is still drawn", async () => {
    await show({ outline: null });
    expect(screen.getByText("No hay parcela dentro de la vista: no se pueden calcular las lecturas.")).toBeInTheDocument();
    expect(mount.mock.calls[0][1].perimeter).toEqual([]);
    expect(screen.getByRole("img", { name: /Relieve 3D del terreno/ })).toBeInTheDocument();
  });

  it("readings use the server's plot area and the translated window", async () => {
    await show({ plot_area_m2: 2905.99 });
    expect(screen.getByText("Superficie del polígono").nextElementSibling?.textContent).toMatch(/^2\.?906 m²$/);
    expect(screen.getByText("Vista").nextElementSibling?.textContent).toBe("100 × 200 m");
  });

  it("no axe violations with all the service notices", async () => {
    const { container } = await show({ clipped: true, parcel_clipped: true, grid: planeGrid(4, 4, [[1, 1]]) });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("ReliefViewer · WebGL release with the API", () => {
  it("releases each scene exactly once on unmount", async () => {
    const user = userEvent.setup();
    api.mockResolvedValue(apiReliefJson());
    const { unmount } = render(<ReliefViewer projectCode={REAL} initialReference={API_REFERENCE} />);
    await user.click(viewButton());
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    await user.selectOptions(screen.getByLabelText("Recorte"), "Solo la parcela");
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(2));
    unmount();
    expect(scenes).toHaveLength(2);
    for (const scene of scenes) expect(scene.release).toHaveBeenCalledTimes(1);
  });

  it("without WebGL the message appears and the data of the service are not lost", async () => {
    const user = userEvent.setup();
    mount.mockReset();
    mount.mockImplementation(() => {
      throw new Error("WebGL no disponible");
    });
    api.mockResolvedValue(apiReliefJson());
    render(<ReliefViewer projectCode={REAL} initialReference={API_REFERENCE} />);
    await user.click(viewButton());
    expect(await screen.findByText("Este navegador no puede mostrar el modelo 3D (WebGL no disponible).")).toBeInTheDocument();
    expect(screen.getByText(/Fuente: MDT 5 m, IGN/)).toBeInTheDocument();
  });
});
