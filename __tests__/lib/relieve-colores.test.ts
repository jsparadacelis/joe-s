import { leerColoresEscena, leerRampaAlturas } from "@/lib/relieve-colores";

describe("colores de la escena (tokens CSS)", () => {
  afterEach(() => document.documentElement.removeAttribute("style"));

  it("lee fondo, acento y borde de los tokens, sin espacios sobrantes", () => {
    document.documentElement.style.setProperty("--surface-2", " tono-fondo ");
    document.documentElement.style.setProperty("--point", "tono-acento");
    document.documentElement.style.setProperty("--line", "tono-borde");
    expect(leerColoresEscena()).toEqual({ fondo: "tono-fondo", acento: "tono-acento", borde: "tono-borde" });
  });

  it("lee la rampa de alturas de cuatro tokens", () => {
    ["bajo", "medio-bajo", "medio-alto", "alto"].forEach((n, i) =>
      document.documentElement.style.setProperty(`--relieve-${n}`, `tono-${i}`),
    );
    expect(leerRampaAlturas()).toEqual(["tono-0", "tono-1", "tono-2", "tono-3"]);
  });

  it("sin tokens (jsdom) devuelve cadenas vacías", () => {
    expect(leerColoresEscena()).toEqual({ fondo: "", acento: "", borde: "" });
  });
});
