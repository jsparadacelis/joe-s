import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { ProjectTabs } from "@/components/project/ProjectTabs";

const mockPathname = jest.fn();
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname() }));

function nav() {
  return screen.getByRole("navigation", { name: "Secciones del proyecto" });
}
const PHASE = "Fase y promoción";
const PLAN = "Plan y tiempos";

describe("ProjectTabs", () => {
  beforeEach(() => mockPathname.mockReturnValue("/proyectos/PRY-EJ-001/fase/3"));

  it("is a «Secciones del proyecto» navigation with two links with the exact text", () => {
    render(<ProjectTabs code="PRY-EJ-001" currentPhase={3} />);
    const links = within(nav()).getAllByRole("link");
    expect(links.map((l) => l.textContent?.trim())).toEqual([PHASE, PLAN]);
  });

  it("«Fase y promoción» leads to the current phase and «Plan y tiempos» to its tab", () => {
    render(<ProjectTabs code="PRY-EJ-001" currentPhase={3} />);
    expect(screen.getByRole("link", { name: PHASE })).toHaveAttribute("href", "/proyectos/PRY-EJ-001/fase/3");
    expect(screen.getByRole("link", { name: PLAN })).toHaveAttribute("href", "/proyectos/PRY-EJ-001/plan-y-tiempos");
  });

  it("uses the received code and current phase", () => {
    render(<ProjectTabs code="PRY-EJ-003" currentPhase={6} />);
    expect(screen.getByRole("link", { name: PHASE })).toHaveAttribute("href", "/proyectos/PRY-EJ-003/fase/6");
    expect(screen.getByRole("link", { name: PLAN })).toHaveAttribute("href", "/proyectos/PRY-EJ-003/plan-y-tiempos");
  });

  it("current phase 0 links to /fase/0", () => {
    render(<ProjectTabs code="PRY-EJ-002" currentPhase={0} />);
    expect(screen.getByRole("link", { name: PHASE })).toHaveAttribute("href", "/proyectos/PRY-EJ-002/fase/0");
  });

  it.each(["/proyectos/PRY-EJ-001/fase/3", "/proyectos/PRY-EJ-001/fase/1", "/proyectos/PRY-EJ-001/fase/7"])(
    "in %s only «Fase y promoción» has aria-current=page",
    (path) => {
      mockPathname.mockReturnValue(path);
      render(<ProjectTabs code="PRY-EJ-001" currentPhase={3} />);
      expect(screen.getByRole("link", { name: PHASE })).toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("link", { name: PLAN })).not.toHaveAttribute("aria-current");
    },
  );

  it("in plan-y-tiempos only «Plan y tiempos» has aria-current=page", () => {
    mockPathname.mockReturnValue("/proyectos/PRY-EJ-001/plan-y-tiempos");
    render(<ProjectTabs code="PRY-EJ-001" currentPhase={3} />);
    expect(screen.getByRole("link", { name: PLAN })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: PHASE })).not.toHaveAttribute("aria-current");
  });

  it.each(["/proyectos/PRY-EJ-001", "/cartera", "/"])("on route %s no tab is active", (path) => {
    mockPathname.mockReturnValue(path);
    render(<ProjectTabs code="PRY-EJ-001" currentPhase={3} />);
    for (const l of within(nav()).getAllByRole("link")) expect(l).not.toHaveAttribute("aria-current");
  });

  it("Tab goes through the two tabs in order", async () => {
    const user = userEvent.setup();
    render(<ProjectTabs code="PRY-EJ-001" currentPhase={3} />);
    await user.tab();
    expect(screen.getByRole("link", { name: PHASE })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: PLAN })).toHaveFocus();
  });

  it("Enter on a focused tab activates its link", async () => {
    const user = userEvent.setup();
    render(<ProjectTabs code="PRY-EJ-001" currentPhase={3} />);
    const target = screen.getByRole("link", { name: PLAN });
    const onClick = jest.fn((e: Event) => e.preventDefault());
    target.addEventListener("click", onClick);
    await user.tab();
    await user.tab();
    expect(target).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it.each(["/proyectos/PRY-EJ-001/fase/3", "/proyectos/PRY-EJ-001/plan-y-tiempos"])(
    "no accessibility violations in %s",
    async (path) => {
      mockPathname.mockReturnValue(path);
      const { container } = render(<ProjectTabs code="PRY-EJ-001" currentPhase={3} />);
      expect(await axe(container)).toHaveNoViolations();
    },
  );
});
