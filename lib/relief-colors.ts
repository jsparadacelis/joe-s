/** Colores de la escena, leídos de los tokens CSS del tema activo (nunca literales). */
export interface SceneColors {
  background: string;
  accent: string;
  border: string;
}

/** Rampa de alturas (de la cota más baja a la más alta), también definida por tokens. */
export type HeightRamp = readonly [string, string, string, string];

const RAMP_TOKENS = ["--relieve-bajo", "--relieve-medio-bajo", "--relieve-medio-alto", "--relieve-alto"] as const;

function read(estilo: CSSStyleDeclaration, token: string): string {
  return estilo.getPropertyValue(token).trim();
}

/** Lee fondo, acento y borde del documento. En entornos sin estilos (tests) devuelve cadenas vacías. */
export function readSceneColors(raiz: Element = document.documentElement): SceneColors {
  const estilo = getComputedStyle(raiz);
  return { background: read(estilo, "--surface-2"), accent: read(estilo, "--point"), border: read(estilo, "--line") };
}

/** Lee la rampa de alturas de los tokens `--relieve-*`. */
export function readHeightRamp(raiz: Element = document.documentElement): HeightRamp {
  const estilo = getComputedStyle(raiz);
  const [a, b, c, d] = RAMP_TOKENS.map((t) => read(estilo, t));
  return [a, b, c, d];
}
