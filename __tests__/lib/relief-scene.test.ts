import { MeshStandardMaterial } from "three";
import { mountScene } from "@/lib/relief-scene";
import { slopedPlane } from "../helpers/relief-plane";

// jsdom has no WebGL: the renderer and controls are replaced; the scene (meshes, lines, lights) is real.
const renderer = {
  domElement: undefined as unknown as HTMLCanvasElement,
  setPixelRatio: jest.fn(),
  setSize: jest.fn(),
  render: jest.fn(),
  dispose: jest.fn(),
  forceContextLoss: jest.fn(),
  outputColorSpace: "",
};
const controls = {
  target: { set: jest.fn(), x: 0, y: 0, z: 0 },
  update: jest.fn(),
  dispose: jest.fn(),
  listenToKeyEvents: jest.fn(),
  stopListenToKeyEvents: jest.fn(),
};
let failWebGL = false;

jest.mock("three", () => {
  const real = jest.requireActual("three");
  return {
    ...real,
    WebGLRenderer: jest.fn(() => {
      if (failWebGL) throw new Error("Error creating WebGL context.");
      return renderer;
    }),
  };
});
jest.mock("three/examples/jsm/controls/OrbitControls.js", () => ({
  OrbitControls: jest.fn(() => controls),
}));

const COLORS = { background: "", accent: "", border: "" };

beforeEach(() => {
  jest.clearAllMocks();
  failWebGL = false;
  renderer.domElement = document.createElement("canvas");
  controls.target.x = controls.target.y = controls.target.z = 0;
  jest.spyOn(window, "requestAnimationFrame").mockReturnValue(42);
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("mountScene", () => {
  it("adds the canvas, listens to the keyboard and draws a frame", () => {
    const host = document.createElement("div");
    mountScene(host, slopedPlane(), 2, COLORS);
    expect(host.contains(renderer.domElement)).toBe(true);
    expect(controls.listenToKeyEvents).toHaveBeenCalledWith(host);
    expect(renderer.render).toHaveBeenCalled();
  });

  it("without WebGL throws Error and leaves no canvas in the host", () => {
    failWebGL = true;
    const host = document.createElement("div");
    expect(() => mountScene(host, slopedPlane(), 2, COLORS)).toThrow(Error);
    expect(host.childElementCount).toBe(0);
  });

  it("release() frees everything exactly once, even if called several times", () => {
    const dispose = jest.spyOn(MeshStandardMaterial.prototype, "dispose");
    const host = document.createElement("div");
    const scene = mountScene(host, slopedPlane(), 2, COLORS);
    scene.release();
    scene.release();
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(42);
    expect(controls.stopListenToKeyEvents).toHaveBeenCalledTimes(1);
    expect(controls.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalled(); // terrain + plot
    expect(host.contains(renderer.domElement)).toBe(false);
  });

  it("updateExaggeration rebuilds the geometry releasing the previous one", () => {
    const dispose = jest.spyOn(MeshStandardMaterial.prototype, "dispose");
    const scene = mountScene(document.createElement("div"), slopedPlane(), 2, COLORS);
    expect(dispose).not.toHaveBeenCalled();
    scene.updateExaggeration(3);
    expect(dispose).toHaveBeenCalledTimes(2);
    scene.release();
    expect(dispose).toHaveBeenCalledTimes(4);
  });

  it("zoomIn, zoomOut and reset update the controls; after release, updateExaggeration does nothing", () => {
    const scene = mountScene(document.createElement("div"), slopedPlane(), 1, COLORS);
    controls.update.mockClear();
    scene.zoomIn();
    scene.zoomOut();
    scene.reset();
    expect(controls.update).toHaveBeenCalledTimes(3);
    scene.release();
    const dispose = jest.spyOn(MeshStandardMaterial.prototype, "dispose");
    scene.updateExaggeration(2);
    expect(dispose).not.toHaveBeenCalled();
  });
});
