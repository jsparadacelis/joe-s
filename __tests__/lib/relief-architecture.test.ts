import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const SCENE = join(root, "lib/relief-scene.ts");
const VIEWER = join(root, "components/project/relief/ReliefViewer.tsx");

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) && !/\.d\.ts$/.test(n) ? [p] : [];
  });
}
const sources = ["app", "components", "lib"].flatMap((d) => walk(join(root, d)));

// import ... from "three" | "three/..." ; import("three") ; require("three")
const THREE_IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["']three(?:\/[^"']*)?["']/;
// static import (not `import type`) of the scene module
const STATIC_SCENE_IMPORT = /^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+["']@\/lib\/relief-scene["']|^\s*import\s+["']@\/lib\/relief-scene["']/m;

describe("3D viewer architecture (RGB-34)", () => {
  it("lib/relief-scene.ts exists and imports three", () => {
    expect(existsSync(SCENE)).toBe(true);
    expect(readFileSync(SCENE, "utf8")).toMatch(THREE_IMPORT);
  });

  it("three is only imported in lib/relief-scene.ts", () => {
    const offenders = sources
      .filter((f) => f !== SCENE)
      .filter((f) => THREE_IMPORT.test(readFileSync(f, "utf8")))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });

  it("ReliefViewer loads the scene with a dynamic import()", () => {
    expect(existsSync(VIEWER)).toBe(true);
    expect(readFileSync(VIEWER, "utf8")).toMatch(/import\s*\(\s*["']@\/lib\/relief-scene["']\s*\)/);
  });

  it("no file statically imports the scene module (only `import type` is allowed)", () => {
    const offenders = sources
      .filter((f) => f !== SCENE)
      .filter((f) => STATIC_SCENE_IMPORT.test(readFileSync(f, "utf8")))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });

  it("the scene is not used from the page (server render): app/ does not reference it", () => {
    const offenders = sources
      .filter((f) => f.startsWith(join(root, "app")))
      .filter((f) => /relief-scene/.test(readFileSync(f, "utf8")))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });
});
