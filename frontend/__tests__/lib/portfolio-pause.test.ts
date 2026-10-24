import { fetchPortfolio } from "@/lib/portfolio";
import { apiProject, requestReturning } from "../helpers/portfolio-sample";

const AS_OF = "2026-10-24";
const PAUSE = { reason: "client_wait", expected_resumption: "2026-11-09", overdue: false, days_overdue: 0 };

describe("fetchPortfolio · pause field (RGB-21, additive)", () => {
  it("maps pause from snake_case to camelCase with the reason in the front vocabulary", async () => {
    const api = apiProject({
      code: "PRY-2026-005",
      phase: 2,
      status: "paused",
      pause: { ...PAUSE, overdue: true, days_overdue: 3 },
    });
    const { rows } = await fetchPortfolio(requestReturning({ as_of: AS_OF, projects: [api] }));
    expect(rows[0].status).toBe("paused");
    expect(rows[0].pause).toEqual({
      reason: "client-wait",
      expectedResumption: "2026-11-09",
      overdue: true,
      daysOverdue: 3,
    });
  });

  it("pause may be null with status paused (open pause only in projects.paused)", async () => {
    const api = apiProject({ status: "paused", phase: 3, pause: null });
    const { rows } = await fetchPortfolio(requestReturning({ as_of: AS_OF, projects: [api] }));
    expect(rows[0].status).toBe("paused");
    expect(rows[0].pause).toBeNull();
  });

  it("an API that does not send the field yet (older back) gives null", async () => {
    const withoutPause: Record<string, unknown> = { ...apiProject({ status: "green", phase: 2 }) };
    delete withoutPause.pause;
    const { rows } = await fetchPortfolio(requestReturning({ as_of: AS_OF, projects: [withoutPause] }));
    expect(rows[0].pause).toBeNull();
  });

  it.each([
    ["authority_wait", "authority-wait"],
    ["internal_decision", "internal-decision"],
    ["other", "other"],
    ["something_new", "other"],
  ])("reason %s becomes %s", async (apiReason, expected) => {
    const api = apiProject({ status: "paused", phase: 2, pause: { ...PAUSE, reason: apiReason } });
    const { rows } = await fetchPortfolio(requestReturning({ as_of: AS_OF, projects: [api] }));
    expect(rows[0].pause?.reason).toBe(expected);
  });
});
