import { readSceneColors, readHeightRamp } from "@/lib/relief-colors";

describe("scene colours (CSS tokens)", () => {
  afterEach(() => document.documentElement.removeAttribute("style"));

  it("reads background, accent and border from the tokens, without surplus whitespace", () => {
    document.documentElement.style.setProperty("--surface-2", " tone-background ");
    document.documentElement.style.setProperty("--point", "tone-accent");
    document.documentElement.style.setProperty("--relief-clip", "tone-border");
    expect(readSceneColors()).toEqual({ background: "tone-background", accent: "tone-accent", border: "tone-border" });
  });

  it("reads the height ramp from four tokens", () => {
    ["low", "mid-low", "mid-high", "high"].forEach((n, i) =>
      document.documentElement.style.setProperty(`--relief-${n}`, `tone-${i}`),
    );
    expect(readHeightRamp()).toEqual(["tone-0", "tone-1", "tone-2", "tone-3"]);
  });

  it("without tokens (jsdom) returns empty strings", () => {
    expect(readSceneColors()).toEqual({ background: "", accent: "", border: "" });
  });
});
