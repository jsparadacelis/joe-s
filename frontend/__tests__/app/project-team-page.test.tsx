/**
 * RGB-49 · `app/projects/[code]/team/page.tsx` (default export, async server component, like plan-and-timing):
 *   title = project name, description «<code> · Equipo», renders <ProjectTeamEditor code={project.code} />,
 *   metadata title «Equipo del proyecto», unknown project -> notFound().
 */
import { render, screen } from "@testing-library/react";
import TeamPage, { metadata } from "@/app/projects/[code]/team/page";

jest.mock("next/navigation", () => ({
  usePathname: () => "/projects/PRY-2026-001/team",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
jest.mock("@/components/project/ProjectTeamEditor", () => ({
  ProjectTeamEditor: ({ code }: { code: string }) => <div data-testid="team-editor">{code}</div>,
}));

const reply = (status: number, body: unknown) => ({ ok: status < 300, status, text: async () => JSON.stringify(body) });
let original: typeof fetch;
beforeEach(() => {
  original = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = original;
});
function stubProject(status = 200) {
  globalThis.fetch = (async () =>
    reply(status, status === 200 ? { code: "PRY-2026-001", name: "Test house", current_phase: 2 } : { detail: { code: "project_not_found", message: "No existe." } })) as unknown as typeof fetch;
}
const page = (code: string) => TeamPage({ params: Promise.resolve({ code }) });

describe("/projects/[code]/team", () => {
  it("shows the project name, the code and the team editor for that code", async () => {
    stubProject();
    render(await page("PRY-2026-001"));
    expect(screen.getByRole("heading", { level: 1, name: "Test house" })).toBeInTheDocument();
    expect(screen.getByText("PRY-2026-001 · Equipo")).toBeInTheDocument();
    expect(screen.getByTestId("team-editor")).toHaveTextContent("PRY-2026-001");
  });

  it("has the page title «Equipo del proyecto»", () => {
    expect(metadata.title).toBe("Equipo del proyecto");
  });

  it("a project that does not exist is a 404", async () => {
    stubProject(404);
    await expect(page("PRY-NOPE")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
