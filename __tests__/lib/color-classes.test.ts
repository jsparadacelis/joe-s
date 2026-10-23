import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const css = readFileSync(join(root, "app/globals.css"), "utf8");
const tokens = new Set([...css.matchAll(/--color-([\w-]+):\s*var\(/g)].map((m) => m[1]));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(n) ? [p] : [];
  });
}

// Sufijos que NO son color para cada prefijo (tamaños, alineación, lados, estilos).
const NON_COLOR: Record<string, RegExp> = {
  text: /^(xs|s|m|l|xl|2xl|left|right|center|wrap|nowrap|balance)$/,
  border: /^([xytblrse]|collapse|solid|dashed|\d+)$/,
  outline: /^(\d+|solid|none)$/,
  bg: /^$/,
  ring: /^(\d+)$/,
};

it("el tema define sus colores y anula la paleta por defecto de Tailwind", () => {
  expect(css).toMatch(/--color-\*:\s*initial;/);
  expect(tokens.size).toBeGreaterThan(10);
});

it("los componentes solo usan clases de color definidas por los tokens", () => {
  const offenders: string[] = [];
  for (const file of ["app", "components"].flatMap((d) => walk(join(root, d)))) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/(?<![\w-])(?:[\w-]+:)*(bg|text|border|outline|ring|fill|stroke|divide|accent|caret|decoration|shadow)-([\w./[\]#-]+)/g)) {
      const [cls, prefix, rest] = m;
      if (NON_COLOR[prefix]?.test(rest)) continue;
      const name = rest.replace(/\/\d+$/, "");
      if (!tokens.has(name)) offenders.push(`${file}: ${cls}`);
    }
  }
  expect(offenders).toEqual([]);
});
