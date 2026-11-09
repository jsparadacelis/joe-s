/**
 * RGB-51b · `refreshFromCadastre` also returns `unavailable: string[]`: the external sources that failed
 * (`inspire`, `open_meteo`, `pvgis`). Unknown ids (and non-strings) are ignored; absent means [].
 */
import { createSampleTechnicalDataApi, refreshFromCadastre } from "@/lib/technical-data-api";
import { apiSheetJson } from "../helpers/technical-data-fake-api";

const REF = "1234567DG3413S0001AB";
const refresh = (extra: Record<string, unknown>) =>
  refreshFromCadastre("PRY-2026-001", REF, jest.fn().mockResolvedValue({ ...apiSheetJson(), unmapped: [], ...extra }));

describe("refreshFromCadastre · unavailable", () => {
  it("returns the known source ids as given, in order", async () => {
    expect((await refresh({ unavailable: ["inspire", "open_meteo", "pvgis"] })).unavailable).toEqual(["inspire", "open_meteo", "pvgis"]);
  });

  it("ignores unknown ids and non-strings", async () => {
    expect((await refresh({ unavailable: ["inspire", "mystery_source", 3, null, "pvgis"] })).unavailable).toEqual(["inspire", "pvgis"]);
  });

  it("absent -> []", async () => {
    expect((await refresh({})).unavailable).toEqual([]);
  });

  it("not an array -> []", async () => {
    expect((await refresh({ unavailable: "inspire" })).unavailable).toEqual([]);
  });

  it("keeps mapping the sheet and `unmapped`", async () => {
    const result = await refresh({ unmapped: ["use"], unavailable: ["pvgis"] });
    expect(result.unmapped).toEqual(["use"]);
    expect(result.cadastralReference).toBe(REF);
  });

  it("the sample API reports nothing unavailable", async () => {
    const result = await createSampleTechnicalDataApi().refresh("PRY-EJ-001", REF);
    expect(result.unavailable).toEqual([]);
  });
});
