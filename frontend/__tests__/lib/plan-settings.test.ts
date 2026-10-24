import { ApiError, createApiClient } from "@/lib/api";
import {
  PROJECT_TYPES,
  PROJECT_TYPE_LABELS,
  SCALES,
  SCALE_LABELS,
  fetchPlanSettings,
  updateScaleFactor,
  updateTemplate,
  validateFactor,
  validateWeeks,
  MAX_WEEKS,
  MIN_FACTOR,
  MAX_FACTOR,
} from "@/lib/plan-settings";

// Messages changed with the bounds (MAX_WEEKS = 520, MIN_FACTOR = 0.1): the old texts ("al menos 1",
// "mayor que 0") no longer describe the accepted range.
const WEEKS_MESSAGE = "Cada plantilla necesita exactamente 7 valores de semanas, enteros y entre 1 y 520.";
const FACTOR_MESSAGE = "El factor de escala debe ser un número entre 0,1 y 10.";

function fakeResponse(status: number, bodyText = "") {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => bodyText,
    json: async () => JSON.parse(bodyText),
  };
}

function setup(response = fakeResponse(204)) {
  const fetch = jest.fn().mockResolvedValue(response);
  const client = createApiClient({ baseUrl: "https://api.example.test", fetch });
  return { fetch, request: client.request };
}

describe("labels", () => {
  it("lists the six project types with Spanish labels", () => {
    expect(PROJECT_TYPES).toEqual([
      "single_family_house",
      "rehabilitation",
      "multi_family",
      "facility",
      "industrial",
      "renovation_interiors",
    ]);
    expect(PROJECT_TYPES.map((t) => PROJECT_TYPE_LABELS[t])).toEqual([
      "Vivienda unifamiliar",
      "Rehabilitación",
      "Plurifamiliar",
      "Dotacional",
      "Industrial",
      "Reforma de interiores",
    ]);
  });

  it("lists the three scales with Spanish labels", () => {
    expect(SCALES).toEqual(["small", "medium", "large"]);
    expect(SCALES.map((s) => SCALE_LABELS[s])).toEqual(["Pequeña", "Media", "Grande"]);
  });
});

describe("fetchPlanSettings", () => {
  it("GETs /api/settings/plan and maps scale_factors to scaleFactors", async () => {
    const { fetch, request } = setup(
      fakeResponse(
        200,
        JSON.stringify({
          templates: { industrial: [3, 3, 5, 7, 10, 52, 5] },
          scale_factors: { small: 0.5, medium: 1, large: 2 },
        }),
      ),
    );
    const settings = await fetchPlanSettings(request);
    expect(fetch.mock.calls[0][0]).toBe("https://api.example.test/api/settings/plan");
    expect(fetch.mock.calls[0][1]).toEqual(expect.objectContaining({ method: "GET" }));
    expect(settings.templates.industrial).toEqual([3, 3, 5, 7, 10, 52, 5]);
    expect(settings.scaleFactors).toEqual({ small: 0.5, medium: 1, large: 2 });
    expect(settings).not.toHaveProperty("scale_factors");
  });

  it("returns every template untouched", async () => {
    const templates = {
      single_family_house: [1, 2, 3, 4, 5, 6, 7],
      rehabilitation: [2, 2, 2, 2, 2, 2, 2],
      multi_family: [3, 3, 3, 3, 3, 3, 3],
      facility: [4, 4, 4, 4, 4, 4, 4],
      industrial: [3, 3, 5, 7, 10, 52, 5],
      renovation_interiors: [1, 1, 1, 1, 1, 1, 1],
    };
    const { request } = setup(fakeResponse(200, JSON.stringify({ templates, scale_factors: { small: 0.8, medium: 1, large: 1.3 } })));
    const settings = await fetchPlanSettings(request);
    expect(settings.templates).toEqual(templates);
  });

  it("propagates ApiError", async () => {
    const fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const { request } = createApiClient({ baseUrl: "https://api.example.test", fetch });
    await expect(fetchPlanSettings(request)).rejects.toMatchObject({ status: 0, code: "network_error" });
  });
});

describe("updateTemplate", () => {
  it("PUTs { weeks } to /api/settings/plan/templates/{type}", async () => {
    const { fetch, request } = setup();
    await expect(updateTemplate("multi_family", [1, 2, 3, 4, 5, 6, 7], request)).resolves.toBeUndefined();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.example.test/api/settings/plan/templates/multi_family");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ weeks: [1, 2, 3, 4, 5, 6, 7] });
  });

  it("propagates the server rejection", async () => {
    const { request } = setup(
      fakeResponse(422, JSON.stringify({ detail: { code: "invalid_weeks", message: WEEKS_MESSAGE } })),
    );
    const error = await updateTemplate("facility", [1, 1, 1, 1, 1, 1, 1], request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, code: "invalid_weeks", message: WEEKS_MESSAGE });
  });
});

describe("updateScaleFactor", () => {
  it("PUTs { factor } to /api/settings/plan/scale-factors/{scale}", async () => {
    const { fetch, request } = setup();
    await expect(updateScaleFactor("large", 2.5, request)).resolves.toBeUndefined();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.example.test/api/settings/plan/scale-factors/large");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ factor: 2.5 });
  });
});

describe("updateScaleFactor errors", () => {
  it("propagates the server rejection", async () => {
    const { request } = setup(
      fakeResponse(422, JSON.stringify({ detail: { code: "invalid_factor", message: FACTOR_MESSAGE } })),
    );
    const error = await updateScaleFactor("small", 11, request).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 422, code: "invalid_factor", message: FACTOR_MESSAGE });
  });
});

describe("validateWeeks", () => {
  it("returns null for seven integers >= 1", () => {
    expect(validateWeeks([1, 1, 1, 1, 1, 1, 1])).toBeNull();
    expect(validateWeeks([3, 3, 5, 7, 10, 52, 5])).toBeNull();
  });

  it.each([
    ["six values", [1, 1, 1, 1, 1, 1]],
    ["eight values", [1, 1, 1, 1, 1, 1, 1, 1]],
    ["empty list", []],
    ["a zero", [1, 0, 1, 1, 1, 1, 1]],
    ["a negative", [1, 1, -2, 1, 1, 1, 1]],
    ["a decimal", [1, 1, 1, 2.5, 1, 1, 1]],
    ["a NaN (empty field)", [1, 1, 1, 1, NaN, 1, 1]],
    ["an Infinity", [1, 1, 1, 1, 1, Infinity, 1]],
    ["521 weeks (just above the cap)", [1, 1, 1, 1, 1, 521, 1]],
    ["2147483648 weeks", [1, 1, 1, 1, 1, 1, 2147483648]],
    ["99999999999 weeks", [99999999999, 1, 1, 1, 1, 1, 1]],
  ])("rejects %s with the API message", (_name, weeks) => {
    expect(validateWeeks(weeks as number[])).toBe(WEEKS_MESSAGE);
  });
});

describe("plan bounds", () => {
  it("exports the bounds shared by the client validation", () => {
    expect(MAX_WEEKS).toBe(520);
    expect(MIN_FACTOR).toBe(0.1);
    expect(MAX_FACTOR).toBe(10);
  });

  it("accepts exactly 520 weeks", () => {
    expect(validateWeeks([520, 520, 520, 520, 520, 520, 520])).toBeNull();
  });
});

describe("validateFactor", () => {
  // 0.01 used to be valid (> 0); it is now below MIN_FACTOR, so the lower bound case is 0.1.
  it.each([0.1, 0.5, 1, 9.99, 10])("accepts %s", (factor) => {
    expect(validateFactor(factor)).toBeNull();
  });

  it.each([0, -1, 0.09, 0.01, 1e-10, 10.01, 11, NaN, Infinity])("rejects %s with the API message", (factor) => {
    expect(validateFactor(factor)).toBe(FACTOR_MESSAGE);
  });
});
