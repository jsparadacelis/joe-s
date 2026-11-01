import { readFileSync } from "fs";
import path from "path";
import { calculateCapacity } from "@/lib/capacity";
import type { TechnicalDatum } from "@/lib/technical-data";

interface CapacityCase {
  name: string;
  values: Record<string, string>;
  missing: string[];
  expected: {
    surface: number;
    buildableArea: number;
    footprint: number;
    byFloors: number;
    maximum: number;
    limitedBy: string;
    existing: number | null;
    existingShare: number | null;
    minPlot: number | null;
    meetsMinPlot: boolean | null;
  } | null;
}

// Same file the backend reads (test_capacity.py): the capacity rule must not drift between the
// screen and the API (RGB-30). `missing` and `existingShare` exist only on the server.
const sharedCases: CapacityCase[] = JSON.parse(
  readFileSync(path.join(__dirname, "../../../backend/tests/technical_data/domain/capacity_cases.json"), "utf8"),
);

function data(values: Record<string, string>): TechnicalDatum[] {
  return Object.entries(values).map(([id, value]) => ({ id, value, original: null, verified: false }));
}

describe("capacity parity with the server", () => {
  it.each(sharedCases.map((c) => [c.name, c] as const))("%s", (_name, shared) => {
    const result = calculateCapacity(data(shared.values));
    if (shared.expected === null) {
      expect(result).toBeNull();
      return;
    }
    const expected = shared.expected;
    expect(result).not.toBeNull();
    const { limitedBy, meetsMinPlot, existing, minPlot, ...numbers } = result!;
    expect(limitedBy).toBe(expected.limitedBy);
    expect(meetsMinPlot).toBe(expected.meetsMinPlot);
    expect(existing).toBe(expected.existing);
    expect(minPlot).toBe(expected.minPlot);
    for (const key of ["surface", "buildableArea", "footprint", "byFloors", "maximum"] as const) {
      // floating point on the screen, exact on the server
      expect(numbers[key]).toBeCloseTo(expected[key], 6);
    }
  });
});
