import { readFileSync } from "fs";
import path from "path";

import { ApiError, createApiClient, type ResponseLike } from "@/lib/api";
import {
  CRITERIA,
  CRITERION_LABELS,
  computeScore,
  fetchScoring,
  fetchScoringSettings,
  formatScore,
  recommend,
  saveScoring,
  saveScoringSettings,
  validateScoringSettings,
  type Ratings,
  type Weights,
} from "@/lib/scoring";

interface SharedCase {
  ratings: Ratings;
  weights: Weights;
  score: string;
}
// Same file the backend reads (test_scoring_front_parity.py): the server's rounding (half up) is the reference.
const sharedCases: SharedCase[] = JSON.parse(
  readFileSync(path.join(__dirname, "../../../backend/tests/opportunity/domain/score_cases.json"), "utf8"),
);

describe("computeScore parity with the server", () => {
  it.each(sharedCases.map((c, i) => [i, c] as const))("case %i matches the server's score", (_i, c) => {
    expect(computeScore(c.ratings, c.weights)).toBe(Number(c.score));
  });
});

const all = <T,>(value: T) => Object.fromEntries(CRITERIA.map((c) => [c, value])) as Record<(typeof CRITERIA)[number], T>;
const EQUAL: Weights = all(1);

function json(status: number, body?: unknown): ResponseLike {
  return { ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? "" : JSON.stringify(body)) };
}
function clientWith(response: ResponseLike) {
  const fetch = jest.fn().mockResolvedValue(response);
  return { request: createApiClient({ baseUrl: "http://api", fetch }).request, fetch };
}

describe("criteria", () => {
  it("lists the seven criteria in contract order with Spanish labels", () => {
    expect(CRITERIA).toEqual(["client_fit", "location", "typology", "budget", "timeline", "source", "probability"]);
    expect(CRITERIA.map((c) => CRITERION_LABELS[c])).toEqual([
      "Encaje del cliente",
      "Localización",
      "Tipología",
      "Presupuesto",
      "Plazo",
      "Fuente",
      "Probabilidad",
    ]);
  });
});

describe("computeScore", () => {
  it("is 60 with every rating at 3 and equal weights", () => {
    expect(computeScore(all(3), EQUAL)).toBe(60);
  });
  it("is 100 with every rating at 5 and 20 with every rating at 1", () => {
    expect(computeScore(all(5), EQUAL)).toBe(100);
    expect(computeScore(all(1), EQUAL)).toBe(20);
  });
  it("does not change when all the weights are scaled by the same factor", () => {
    expect(computeScore(all(3), all(2.5))).toBe(60);
  });
  it("weights the criteria: 100·Σ(p·r)/(5·Σp)", () => {
    const ratings: Ratings = { ...all(1), client_fit: 5 };
    const weights: Weights = { ...all(1), client_fit: 4 };
    // 100 · (4·5 + 6·1) / (5 · 10) = 52
    expect(computeScore(ratings, weights)).toBe(52);
  });
  it("rounds to one decimal (22.857… -> 22.9)", () => {
    // 100 · (2 + 6·1) / (5 · 7)
    expect(computeScore({ ...all(1), client_fit: 2 }, EQUAL)).toBe(22.9);
  });
  it("rounds 26.666… up and 33.33… down", () => {
    const three: Weights = { ...all(0), client_fit: 1, location: 1, typology: 1 };
    // 100 · (2 + 1 + 1) / 15 = 26.666…
    expect(computeScore({ ...all(1), client_fit: 2 }, three)).toBe(26.7);
    // 100 · (2 + 2 + 1) / 15 = 33.333…
    expect(computeScore({ ...all(1), client_fit: 2, location: 2 }, three)).toBe(33.3);
  });
});

describe("recommend", () => {
  it("recommends pursuing at exactly the threshold", () => {
    expect(recommend(60, 60)).toBe("pursue");
  });
  it("recommends pursuing above and not pursuing just below", () => {
    expect(recommend(60.1, 60)).toBe("pursue");
    expect(recommend(59.9, 60)).toBe("do_not_pursue");
  });
});

describe("formatScore", () => {
  it("uses the Spanish decimal comma with one decimal", () => {
    expect(formatScore(60)).toBe("60,0");
    expect(formatScore(22.9)).toBe("22,9");
  });
});

describe("validateScoringSettings", () => {
  const ok = { weights: EQUAL, threshold: 60 };
  it("accepts the defaults and the limits", () => {
    expect(validateScoringSettings(ok)).toEqual({});
    expect(validateScoringSettings({ weights: all(10), threshold: 100 })).toEqual({});
    expect(validateScoringSettings({ weights: all(0.01), threshold: 1 })).toEqual({});
  });
  it.each([0, -1, 10.01, NaN, Infinity, 1.005])("rejects the weight %s, reporting the first invalid criterion", (bad) => {
    const errors = validateScoringSettings({ ...ok, weights: { ...EQUAL, location: bad } });
    expect(errors.weights).toBe("Los 7 pesos son obligatorios y deben ser números mayores que 0 y de hasta 10, con un máximo de 2 decimales.");
    expect(errors.weightsField).toBe("location");
  });
  it.each([0, 101, 60.5, NaN, -3])("rejects the threshold %s", (bad) => {
    expect(validateScoringSettings({ ...ok, threshold: bad }).threshold).toBe("El umbral debe ser un número entero entre 1 y 100.");
  });
});

describe("API client", () => {
  const settings = { weights: EQUAL, threshold: 60 };
  const record = {
    project_code: "PRY-2026-001",
    version: 2,
    ratings: all(3),
    weights: EQUAL,
    threshold: 60,
    score: 60,
    recommendation: "pursue",
    scored_by: "Test user",
    scored_at: "2026-10-24T10:00:00Z",
  };

  it("fetchScoringSettings reads GET /api/settings/scoring", async () => {
    const { request, fetch } = clientWith(json(200, settings));
    await expect(fetchScoringSettings(request)).resolves.toEqual(settings);
    expect(fetch).toHaveBeenCalledWith("http://api/api/settings/scoring", { method: "GET" });
  });

  it("saveScoringSettings PUTs the same JSON and accepts 204", async () => {
    const { request, fetch } = clientWith(json(204));
    await expect(saveScoringSettings(settings, request)).resolves.toBeUndefined();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("http://api/api/settings/scoring");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual(settings);
  });

  it("saveScoringSettings surfaces a 422 as ApiError with its code", async () => {
    const { request } = clientWith(json(422, { detail: { code: "invalid_threshold", message: "Umbral no válido." } }));
    await expect(saveScoringSettings(settings, request)).rejects.toMatchObject({ status: 422, code: "invalid_threshold" });
  });

  it("saveScoring POSTs {ratings} and maps the response to camelCase", async () => {
    const { request, fetch } = clientWith(json(201, record));
    const saved = await saveScoring("PRY-2026-001", all(3), request);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("http://api/api/projects/PRY-2026-001/scoring");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ ratings: all(3) });
    expect(saved).toEqual({
      projectCode: "PRY-2026-001",
      version: 2,
      ratings: all(3),
      weights: EQUAL,
      threshold: 60,
      score: 60,
      recommendation: "pursue",
      scoredBy: "Test user",
      scoredAt: "2026-10-24T10:00:00Z",
    });
  });

  it("saveScoring keeps the field of an invalid_ratings error", async () => {
    const { request } = clientWith(json(422, { detail: { code: "invalid_ratings", message: "Mal.", field: "budget" } }));
    await expect(saveScoring("PRY-2026-001", all(3), request)).rejects.toMatchObject({ code: "invalid_ratings", field: "budget" });
  });

  it("fetchScoring returns the latest scoring with its history", async () => {
    const history = [
      { version: 2, score: 60, recommendation: "pursue", scored_at: "2026-10-24T10:00:00Z" },
      { version: 1, score: 40, recommendation: "do_not_pursue", scored_at: "2026-10-23T09:00:00Z" },
    ];
    const { request } = clientWith(json(200, { ...record, history }));
    const result = await fetchScoring("PRY-2026-001", request);
    expect(result?.version).toBe(2);
    expect(result?.history).toEqual([
      { version: 2, score: 60, recommendation: "pursue", scoredAt: "2026-10-24T10:00:00Z" },
      { version: 1, score: 40, recommendation: "do_not_pursue", scoredAt: "2026-10-23T09:00:00Z" },
    ]);
  });

  it("fetchScoring returns null for scoring_not_found", async () => {
    const { request } = clientWith(json(404, { detail: { code: "scoring_not_found", message: "La oportunidad aún no tiene scoring." } }));
    await expect(fetchScoring("PRY-2026-001", request)).resolves.toBeNull();
  });

  it("fetchScoring rethrows project_not_found and other failures", async () => {
    const missing = clientWith(json(404, { detail: { code: "project_not_found", message: "No existe el proyecto X." } }));
    await expect(fetchScoring("X", missing.request)).rejects.toBeInstanceOf(ApiError);
    const down = clientWith(json(500));
    await expect(fetchScoring("X", down.request)).rejects.toMatchObject({ status: 500 });
  });
});
