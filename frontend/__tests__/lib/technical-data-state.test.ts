/**
 * RGB-51 · additions to `@/lib/technical-data`:
 *   TechnicalDatum gets optional `edited?: boolean` and `source?: string` (what the API sends);
 *   isEdited(d) = d.edited when it is defined, else the old rule (original !== null && value !== original);
 *   hasTechnicalData(sheet): boolean — true when the sheet was queried (queriedOn !== null) or any datum has a value
 *   or is verified. The API always returns the whole catalog, so this tells "nothing yet" from "something to show".
 */
import { hasTechnicalData, isEdited, countEdited, DEFINITIONS, type TechnicalData, type TechnicalDatum } from "@/lib/technical-data";

const datum = (over: Partial<TechnicalDatum> = {}): TechnicalDatum => ({ id: "address", value: "A", original: "A", verified: false, ...over });
const sheet = (over: Partial<TechnicalData> = {}, values: Record<string, Partial<TechnicalDatum>> = {}): TechnicalData => ({
  cadastralReference: "",
  queriedOn: null,
  data: DEFINITIONS.map((d) => ({ id: d.id, value: "", original: d.group === "planning" ? null : "", verified: false, ...values[d.id] })),
  ...over,
});

describe("isEdited honours the server's `edited`", () => {
  it("explicit true wins over the derived rule", () => {
    expect(isEdited(datum({ edited: true }))).toBe(true);
  });
  it("explicit false wins over the derived rule", () => {
    expect(isEdited(datum({ value: "B", edited: false }))).toBe(false);
  });
  it("without `edited` the old rule applies", () => {
    expect(isEdited(datum({ value: "B" }))).toBe(true);
    expect(isEdited(datum())).toBe(false);
    expect(isEdited(datum({ original: null, value: "B" }))).toBe(false);
  });
  it("countEdited counts with the same rule", () => {
    expect(countEdited([datum({ edited: true }), datum({ value: "B", edited: false }), datum({ value: "C" })])).toBe(2);
  });
});

describe("hasTechnicalData", () => {
  it("false for an untouched catalog", () => {
    expect(hasTechnicalData(sheet())).toBe(false);
  });
  it("true once queried, even if every value is empty", () => {
    expect(hasTechnicalData(sheet({ queriedOn: "2026-10-18" }))).toBe(true);
  });
  it("true when a value was entered by hand without any query", () => {
    expect(hasTechnicalData(sheet({}, { buildability: { value: "2" } }))).toBe(true);
  });
  it("true when a datum is verified", () => {
    expect(hasTechnicalData(sheet({}, { address: { verified: true } }))).toBe(true);
  });
});
