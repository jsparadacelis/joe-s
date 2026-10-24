import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(tsx?|css)$/.test(name) && name !== "globals.css" ? [path] : [];
  });
}

it("no component or page uses loose colours (tokens only)", () => {
  const root = process.cwd();
  const files = ["app", "components", "lib"].flatMap((d) => sources(join(root, d)));
  const offenders = files.filter((f) => COLOR_LITERAL.test(readFileSync(f, "utf8")));
  expect(offenders).toEqual([]);
});
