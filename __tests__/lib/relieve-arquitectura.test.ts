import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const ESCENA = join(root, "lib/relieve-escena.ts");
const VISOR = join(root, "components/proyecto/relieve/VisorRelieve.tsx");

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) && !/\.d\.ts$/.test(n) ? [p] : [];
  });
}
const fuentes = ["app", "components", "lib"].flatMap((d) => walk(join(root, d)));

// import ... from "three" | "three/..." ; import("three") ; require("three")
const IMPORTA_THREE = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["']three(?:\/[^"']*)?["']/;
// import estático (no `import type`) del módulo de la escena
const IMPORTA_ESCENA_ESTATICO = /^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+["']@\/lib\/relieve-escena["']|^\s*import\s+["']@\/lib\/relieve-escena["']/m;

describe("arquitectura del visor 3D (RGB-34)", () => {
  it("lib/relieve-escena.ts existe e importa three", () => {
    expect(existsSync(ESCENA)).toBe(true);
    expect(readFileSync(ESCENA, "utf8")).toMatch(IMPORTA_THREE);
  });

  it("three solo se importa en lib/relieve-escena.ts", () => {
    const infractores = fuentes
      .filter((f) => f !== ESCENA)
      .filter((f) => IMPORTA_THREE.test(readFileSync(f, "utf8")))
      .map((f) => relative(root, f));
    expect(infractores).toEqual([]);
  });

  it("VisorRelieve carga la escena con import() dinámico", () => {
    expect(existsSync(VISOR)).toBe(true);
    expect(readFileSync(VISOR, "utf8")).toMatch(/import\s*\(\s*["']@\/lib\/relieve-escena["']\s*\)/);
  });

  it("ningún archivo importa de forma estática el módulo de la escena (solo se permite `import type`)", () => {
    const infractores = fuentes
      .filter((f) => f !== ESCENA)
      .filter((f) => IMPORTA_ESCENA_ESTATICO.test(readFileSync(f, "utf8")))
      .map((f) => relative(root, f));
    expect(infractores).toEqual([]);
  });

  it("la escena no se usa desde la página (render de servidor): app/ no la referencia", () => {
    const infractores = fuentes
      .filter((f) => f.startsWith(join(root, "app")))
      .filter((f) => /relieve-escena/.test(readFileSync(f, "utf8")))
      .map((f) => relative(root, f));
    expect(infractores).toEqual([]);
  });
});
