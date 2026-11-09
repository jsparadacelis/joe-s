/**
 * RGB-51b · contract for `@/lib/capacity-api` (new module):
 *   type CapacityAnswer = { capacity: Capacity | null; missing: string[] }   // Capacity from `@/lib/capacity`
 *   fetchCapacity(code, request?): Promise<CapacityAnswer>   GET /api/projects/{code}/capacity
 * Server JSON (snake_case: surface, buildable_area, footprint, by_floors, maximum, limited_by, existing,
 * existing_share, min_plot, meets_min_plot) is mapped to the camelCase `Capacity`. Invalid JSON is
 * ApiError(502, "invalid_capacity_response"); server errors pass through.
 */
import { ApiError } from "@/lib/api";
import { fetchCapacity } from "@/lib/capacity-api";

// PRD case: 96 m², buildability 1,5, occupancy 70 %, PB+2 -> 144 m²t, limited by buildability.
const SERVER_CAPACITY = {
  surface: 96,
  buildable_area: 144,
  footprint: 67.2,
  by_floors: 201.6,
  maximum: 144,
  limited_by: "buildability",
  existing: 142,
  existing_share: 98.6,
  min_plot: 90,
  meets_min_plot: true,
};

const answer = (raw: unknown) => fetchCapacity("PRY-2026-001", jest.fn().mockResolvedValue(raw));

describe("fetchCapacity", () => {
  it("GETs the capacity of the project (code encoded)", async () => {
    const request = jest.fn().mockResolvedValue({ capacity: null, missing: [] });
    await fetchCapacity("PRY 2026/001", request);
    expect(request).toHaveBeenCalledWith("/api/projects/PRY%202026%2F001/capacity", expect.objectContaining({ method: "GET" }));
  });

  it("maps the PRD case to the front Capacity", async () => {
    const result = await answer({ capacity: SERVER_CAPACITY, missing: [] });
    expect(result.missing).toEqual([]);
    expect(result.capacity).toMatchObject({
      surface: 96,
      buildableArea: 144,
      footprint: 67.2,
      byFloors: 201.6,
      maximum: 144,
      limitedBy: "buildability",
      existing: 142,
      minPlot: 90,
      meetsMinPlot: true,
    });
  });

  it("keeps the occupancy-floors limit", async () => {
    const result = await answer({ capacity: { ...SERVER_CAPACITY, limited_by: "occupancy-floors" }, missing: [] });
    expect(result.capacity?.limitedBy).toBe("occupancy-floors");
  });

  it("nullable fields stay null", async () => {
    const result = await answer({
      capacity: { ...SERVER_CAPACITY, existing: null, existing_share: null, min_plot: null, meets_min_plot: null },
      missing: [],
    });
    expect(result.capacity).toMatchObject({ existing: null, minPlot: null, meetsMinPlot: null });
  });

  it("without capacity it returns null and the ids of what is missing", async () => {
    expect(await answer({ capacity: null, missing: ["buildability", "floors"] })).toEqual({
      capacity: null,
      missing: ["buildability", "floors"],
    });
  });

  it.each([
    ["not an object", "nope"],
    ["null", null],
    ["no capacity key", { missing: [] }],
    ["no missing key", { capacity: null }],
    ["capacity is a string", { capacity: "x", missing: [] }],
    ["missing is not an array", { capacity: null, missing: "floors" }],
    ["missing with a non-string", { capacity: null, missing: ["floors", 2] }],
    ["a figure that is not a number", { capacity: { ...SERVER_CAPACITY, maximum: "144" }, missing: [] }],
    ["a required figure that is null", { capacity: { ...SERVER_CAPACITY, surface: null }, missing: [] }],
    ["unknown limited_by", { capacity: { ...SERVER_CAPACITY, limited_by: "height" }, missing: [] }],
    ["meets_min_plot not boolean or null", { capacity: { ...SERVER_CAPACITY, meets_min_plot: "yes" }, missing: [] }],
    ["existing not a number or null", { capacity: { ...SERVER_CAPACITY, existing: "142" }, missing: [] }],
  ])("%s -> ApiError 502 invalid_capacity_response", async (_name, raw) => {
    await expect(answer(raw)).rejects.toMatchObject({ status: 502, code: "invalid_capacity_response" });
    await expect(answer(raw)).rejects.toBeInstanceOf(ApiError);
  });

  it("lets the server error through untouched (404 project not found)", async () => {
    const failure = new ApiError(404, "project_not_found", "No existe el proyecto PRY-2026-001.");
    await expect(fetchCapacity("PRY-2026-001", jest.fn().mockRejectedValue(failure))).rejects.toBe(failure);
  });
});
