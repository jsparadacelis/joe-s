/** Scene colours, read from the CSS tokens of the active theme (never literals). */
export interface SceneColors {
  background: string;
  accent: string;
  border: string;
}

/** Height ramp (from the lowest to the highest elevation), also defined by tokens. */
export type HeightRamp = readonly [string, string, string, string];

const RAMP_TOKENS = ["--relief-low", "--relief-mid-low", "--relief-mid-high", "--relief-high"] as const;

function read(computedStyle: CSSStyleDeclaration, token: string): string {
  return computedStyle.getPropertyValue(token).trim();
}

/** Reads background, accent and border from the document. In environments without styles (tests) returns empty strings. */
export function readSceneColors(root: Element = document.documentElement): SceneColors {
  const computedStyle = getComputedStyle(root);
  return { background: read(computedStyle, "--surface-2"), accent: read(computedStyle, "--point"), border: read(computedStyle, "--relief-clip") };
}

/** Reads the height ramp from the `--relief-*` tokens. */
export function readHeightRamp(root: Element = document.documentElement): HeightRamp {
  const computedStyle = getComputedStyle(root);
  const [a, b, c, d] = RAMP_TOKENS.map((t) => read(computedStyle, t));
  return [a, b, c, d];
}
