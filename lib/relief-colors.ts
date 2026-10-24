/** Colores de la escena, leídos de los tokens CSS del tema activo (nunca literales). */
export interface SceneColors {
  background: string;
  accent: string;
  border: string;
}

/** Rampa de alturas (de la cota más baja a la más alta), también definida por tokens. */
export type HeightRamp = readonly [string, string, string, string];

const RAMP_TOKENS = ["--relieve-bajo", "--relieve-medio-bajo", "--relieve-medio-alto", "--relieve-alto"] as const;

function read(computedStyle: CSSStyleDeclaration, token: string): string {
  return computedStyle.getPropertyValue(token).trim();
}

/** Lee fondo, acento y borde del documento. En entornos sin estilos (tests) devuelve cadenas vacías. */
export function readSceneColors(root: Element = document.documentElement): SceneColors {
  const computedStyle = getComputedStyle(root);
  return { background: read(computedStyle, "--surface-2"), accent: read(computedStyle, "--point"), border: read(computedStyle, "--line") };
}

/** Lee la rampa de alturas de los tokens `--relieve-*`. */
export function readHeightRamp(root: Element = document.documentElement): HeightRamp {
  const computedStyle = getComputedStyle(root);
  const [a, b, c, d] = RAMP_TOKENS.map((t) => read(computedStyle, t));
  return [a, b, c, d];
}
