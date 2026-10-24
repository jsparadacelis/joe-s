import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLOT_FILL_OPACITY } from "@/lib/relief-plot-fill";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]));
}
const themes = {
  light: block(":root"),
  dark: block(':root[data-theme="dark"]'),
  "dark (system)": block(':root:not([data-theme="light"])'),
};

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** Colour of `over` painted with `opacity` on top of `under`. */
function blend(over: string, under: string, opacity: number): string {
  const [o, u] = [rgb(over), rgb(under)];
  return `#${o.map((v, i) => Math.round(v * opacity + u[i] * (1 - opacity)).toString(16).padStart(2, "0")).join("")}`;
}

const RAMP = ["relief-low", "relief-mid-low", "relief-mid-high", "relief-high"];

describe.each(Object.entries(themes))("relief colours, theme %s", (_name, tokens) => {
  it("the clip border reaches 3:1 against the scene background (WCAG 1.4.11)", () => {
    expect(ratio(tokens["relief-clip"], tokens["surface-2"])).toBeGreaterThanOrEqual(3);
  });

  it.each(RAMP)("%s is distinguishable from the scene background", (stop) => {
    expect(ratio(tokens[stop], tokens["surface-2"])).toBeGreaterThanOrEqual(1.5);
  });

  it.each(RAMP)("the plot fill stands out over %s", (stop) => {
    expect(ratio(blend(tokens.point, tokens[stop], PLOT_FILL_OPACITY), tokens[stop])).toBeGreaterThanOrEqual(1.2);
  });

  it("the plot outline (accent) reaches 3:1 against the scene background", () => {
    expect(ratio(tokens.point, tokens["surface-2"])).toBeGreaterThanOrEqual(3);
  });
});
