import { MeshStandardMaterial } from "three";
import { montarEscena } from "@/lib/relieve-escena";
import { planoInclinado } from "../helpers/relieve-plano";

// jsdom no tiene WebGL: se sustituyen el renderer y los controles; la escena (mallas, líneas, luces) es real.
const renderer = {
  domElement: undefined as unknown as HTMLCanvasElement,
  setPixelRatio: jest.fn(),
  setSize: jest.fn(),
  render: jest.fn(),
  dispose: jest.fn(),
  forceContextLoss: jest.fn(),
  outputColorSpace: "",
};
const controles = {
  target: { set: jest.fn(), x: 0, y: 0, z: 0 },
  update: jest.fn(),
  dispose: jest.fn(),
  listenToKeyEvents: jest.fn(),
  stopListenToKeyEvents: jest.fn(),
};
let fallarWebGL = false;

jest.mock("three", () => {
  const real = jest.requireActual("three");
  return {
    ...real,
    WebGLRenderer: jest.fn(() => {
      if (fallarWebGL) throw new Error("Error creating WebGL context.");
      return renderer;
    }),
  };
});
jest.mock("three/examples/jsm/controls/OrbitControls.js", () => ({
  OrbitControls: jest.fn(() => controles),
}));

const COLORES = { fondo: "", acento: "", borde: "" };

beforeEach(() => {
  jest.clearAllMocks();
  fallarWebGL = false;
  renderer.domElement = document.createElement("canvas");
  controles.target.x = controles.target.y = controles.target.z = 0;
  jest.spyOn(window, "requestAnimationFrame").mockReturnValue(42);
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("montarEscena", () => {
  it("añade el lienzo, escucha el teclado y dibuja un fotograma", () => {
    const contenedor = document.createElement("div");
    montarEscena(contenedor, planoInclinado(), 2, COLORES);
    expect(contenedor.contains(renderer.domElement)).toBe(true);
    expect(controles.listenToKeyEvents).toHaveBeenCalledWith(contenedor);
    expect(renderer.render).toHaveBeenCalled();
  });

  it("sin WebGL lanza Error y no deja el lienzo en el contenedor", () => {
    fallarWebGL = true;
    const contenedor = document.createElement("div");
    expect(() => montarEscena(contenedor, planoInclinado(), 2, COLORES)).toThrow(Error);
    expect(contenedor.childElementCount).toBe(0);
  });

  it("liberar() libera todo exactamente una vez, aunque se llame varias", () => {
    const dispose = jest.spyOn(MeshStandardMaterial.prototype, "dispose");
    const contenedor = document.createElement("div");
    const escena = montarEscena(contenedor, planoInclinado(), 2, COLORES);
    escena.liberar();
    escena.liberar();
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(42);
    expect(controles.stopListenToKeyEvents).toHaveBeenCalledTimes(1);
    expect(controles.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalled(); // terreno + parcela
    expect(contenedor.contains(renderer.domElement)).toBe(false);
  });

  it("actualizarExageracion reconstruye la geometría liberando la anterior", () => {
    const dispose = jest.spyOn(MeshStandardMaterial.prototype, "dispose");
    const escena = montarEscena(document.createElement("div"), planoInclinado(), 2, COLORES);
    expect(dispose).not.toHaveBeenCalled();
    escena.actualizarExageracion(3);
    expect(dispose).toHaveBeenCalledTimes(2);
    escena.liberar();
    expect(dispose).toHaveBeenCalledTimes(4);
  });

  it("acercar, alejar y reiniciar actualizan los controles; tras liberar, actualizarExageracion no hace nada", () => {
    const escena = montarEscena(document.createElement("div"), planoInclinado(), 1, COLORES);
    controles.update.mockClear();
    escena.acercar();
    escena.alejar();
    escena.reiniciar();
    expect(controles.update).toHaveBeenCalledTimes(3);
    escena.liberar();
    const dispose = jest.spyOn(MeshStandardMaterial.prototype, "dispose");
    escena.actualizarExageracion(2);
    expect(dispose).not.toHaveBeenCalled();
  });
});
