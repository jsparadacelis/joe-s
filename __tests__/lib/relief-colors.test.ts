import { readSceneColors, readHeightRamp } from "@/lib/relief-colors";

describe("colores de la escena (tokens CSS)", () => {
  afterEach(() => document.documentElement.removeAttribute("style"));

  it("lee fondo, acento y borde de los tokens, sin espacios sobrantes", () => {
    document.documentElement.style.setProperty("--surface-2", " tono-fondo ");
    document.documentElement.style.setProperty("--point", "tono-acento");
    document.documentElement.style.setProperty("--line", "tono-borde");
    expect(readSceneColors()).toEqual({ background: "tono-fondo", accent: "tono-acento", border: "tono-borde" });
  });

  it("lee la rampa de alturas de cuatro tokens", () => {
    ["bajo", "medio-bajo", "medio-alto", "alto"].forEach((n, i) =>
      document.documentElement.style.setProperty(`--relieve-${n}`, `tono-${i}`),
    );
    expect(readHeightRamp()).toEqual(["tono-0", "tono-1", "tono-2", "tono-3"]);
  });

  it("sin tokens (jsdom) devuelve cadenas vacías", () => {
    expect(readSceneColors()).toEqual({ background: "", accent: "", border: "" });
  });
});
