import { readFileSync } from "fs";
import path from "path";
import { DEFINITIONS } from "@/lib/technical-data";

interface CatalogCase {
  id: string;
  group: string;
  type: string;
  unit: string | null;
  options: string[] | null;
}

// Same file the backend reads (test_catalog.py): ids, group, type, unit, options and order of the
// 26 technical data must not drift between the screen and the API (RGB-28).
const sharedCases: CatalogCase[] = JSON.parse(
  readFileSync(path.join(__dirname, "../../../backend/tests/technical_data/domain/catalog_cases.json"), "utf8"),
);

describe("technical data catalog parity with the server", () => {
  it("has the same data in the same order", () => {
    expect(DEFINITIONS.map((d) => d.id)).toEqual(sharedCases.map((c) => c.id));
  });

  it.each(sharedCases.map((c, index) => [c.id, c, index] as const))("%s", (_id, shared, index) => {
    const definition = DEFINITIONS[index];
    expect({
      id: definition.id,
      group: definition.group,
      type: definition.type,
      unit: definition.unit ?? null,
      options: definition.options ? [...definition.options] : null,
    }).toEqual(shared);
  });
});
