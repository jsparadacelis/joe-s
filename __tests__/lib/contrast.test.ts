import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No se encontró el bloque ${selector}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]));
}

const themes = {
  claro: block(":root"),
  oscuro: block(':root[data-theme="dark"]'),
  "oscuro (sistema)": block(':root:not([data-theme="light"])'),
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [texto, fondo] tal como se combinan en los componentes.
const PAIRS: [string, string][] = [
  ["ink", "bg"],
  ["ink", "surface"],
  ["ink-2", "surface"],
  ["ink", "surface-2"],
  ["ink-2", "surface-2"],
  ["muted", "bg"],
  ["muted", "surface"],
  ["muted", "surface-2"],
  ["muted", "off-soft"],
  ["bg", "ink"],
  ["side-ink", "side"],
  ["side-muted", "side"],
  ["side-ink", "side-active"],
  ["on-point", "point"],
  ["ok", "ok-soft"],
  ["warn", "warn-soft"],
  ["bad", "bad-soft"],
  ["point", "point-soft"],
  ["point", "bg"],
  ["point", "surface"],
];

describe("contraste WCAG AA (4.5:1) de los tokens", () => {
  it("el tema oscuro por media query coincide con data-theme=dark", () => {
    expect(themes["oscuro (sistema)"]).toEqual(themes.oscuro);
  });

  it("todos los tokens están definidos en ambos temas", () => {
    expect(Object.keys(themes.oscuro).sort()).toEqual(Object.keys(themes.claro).sort());
  });

  describe.each(Object.entries(themes))("tema %s", (_themeName, tokens) => {
    it.each(PAIRS)("%s sobre %s", (fg, bg) => {
      expect(ratio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
    });
  });
});

// Valores del plan RGB-6 (docs/plans/RGB-6/plan.md). `on-point` es un token añadido por el desarrollador.
const PLAN: Record<string, [string, string]> = {
  bg: ["#F6F5F2", "#161719"], surface: ["#FFFFFF", "#1E1F22"], "surface-2": ["#EBEAE6", "#2A2B2F"],
  hair: ["#D6D5D1", "#34353A"], line: ["#A9A8A4", "#55565A"],
  ink: ["#1C1D1F", "#EBEAE6"], "ink-2": ["#3A3B3E", "#D6D5D1"], muted: ["#686865", "#A9A8A4"],
  point: ["#5E2A35", "#C78492"], "point-soft": ["#EFE4E6", "#3A2429"],
  ok: ["#3E6B4A", "#8CC09A"], "ok-soft": ["#E3ECE5", "#23332A"],
  warn: ["#856016", "#E0B866"], "warn-soft": ["#F3EAD6", "#3A3122"],
  bad: ["#9B3326", "#E5907F"], "bad-soft": ["#F4E1DD", "#3D2623"],
  off: ["#8C8B87", "#A9A8A4"], "off-soft": ["#ECEBE8", "#2A2B2F"],
  side: ["#1C1D1F", "#0F1011"], "side-ink": ["#EBEAE6", "#EBEAE6"],
  "side-muted": ["#A9A8A4", "#8C8B87"], "side-active": ["#3A3B3E", "#2A2B2F"],
};

describe("valores de tokens según la tabla del plan", () => {
  it.each(Object.entries(PLAN))("%s", (name, [light, dark]) => {
    expect(themes.claro[name]?.toLowerCase()).toBe(light.toLowerCase());
    expect(themes.oscuro[name]?.toLowerCase()).toBe(dark.toLowerCase());
  });
});
