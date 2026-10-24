import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { PhaseTimeline } from "@/components/project/PhaseTimeline";
import { PHASES, type PhaseId } from "@/lib/phases";

function links() {
  return within(screen.getByRole("navigation", { name: "Fases del proyecto" })).getAllByRole("link");
}

const STATE_TEXT = { done: "hecha", current: "actual", upcoming: "vista" } as const;

function stateOf(link: HTMLElement) {
  const found = (["done", "current", "upcoming"] as const).filter((e) =>
    new RegExp(`\\b${STATE_TEXT[e]}\\b`, "i").test(link.textContent ?? ""),
  );
  return found;
}

describe("PhaseTimeline", () => {
  it("is a «Fases del proyecto» navigation with a list of 8 items", () => {
    render(<PhaseTimeline code="PRY-EJ-001" currentPhase={3} viewedPhase={3} />);
    const nav = screen.getByRole("navigation", { name: "Fases del proyecto" });
    expect(within(nav).getByRole("list")).toBeInTheDocument();
    expect(within(nav).getAllByRole("listitem")).toHaveLength(8);
  });

  it("shows 8 links with each phase's href, in order", () => {
    render(<PhaseTimeline code="PRY-EJ-001" currentPhase={3} viewedPhase={3} />);
    expect(links().map((l) => l.getAttribute("href"))).toEqual(
      PHASES.map((f) => `/proyectos/PRY-EJ-001/fase/${f.id}`),
    );
  });

  it("each link shows the phase number and name", () => {
    render(<PhaseTimeline code="PRY-EJ-001" currentPhase={3} viewedPhase={3} />);
    links().forEach((l, i) => {
      expect(l).toHaveTextContent(PHASES[i].name);
      expect(l.textContent).toContain(String(i));
    });
  });

  it("uses the received code in the hrefs", () => {
    render(<PhaseTimeline code="PRY-EJ-002" currentPhase={0} viewedPhase={0} />);
    for (const l of links()) expect(l.getAttribute("href")).toMatch(/^\/proyectos\/PRY-EJ-002\/fase\/[0-7]$/);
  });

  it("indicates with accessible text hecha / actual / vista according to the current phase", () => {
    render(<PhaseTimeline code="PRY-EJ-001" currentPhase={3} viewedPhase={3} />);
    const expected = ["done", "done", "done", "current", "upcoming", "upcoming", "upcoming", "upcoming"];
    links().forEach((l, i) => expect(stateOf(l)).toEqual([expected[i]]));
  });

  it("the accessible name of each link includes its state", () => {
    render(<PhaseTimeline code="PRY-EJ-001" currentPhase={3} viewedPhase={3} />);
    expect(screen.getByRole("link", { name: /Anteproyecto.*actual|actual.*Anteproyecto/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Inicio.*hecha|hecha.*Inicio/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Obra.*vista|vista.*Obra/i })).toBeInTheDocument();
  });

  it("aria-current=page only on the phase on screen, different from the current one", () => {
    render(<PhaseTimeline code="PRY-EJ-001" currentPhase={3} viewedPhase={5} />);
    const current = links().filter((l) => l.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("href", "/proyectos/PRY-EJ-001/fase/5");
    expect(document.querySelectorAll("[aria-current]")).toHaveLength(1);
  });

  it("aria-current=page on the current phase when it is the one being viewed", () => {
    render(<PhaseTimeline code="PRY-EJ-001" currentPhase={3} viewedPhase={3} />);
    const current = links().filter((l) => l.hasAttribute("aria-current"));
    expect(current.map((l) => l.getAttribute("href"))).toEqual(["/proyectos/PRY-EJ-001/fase/3"]);
  });

  it("aria-current changes when the phase on screen changes", () => {
    const { rerender } = render(<PhaseTimeline code="PRY-EJ-001" currentPhase={3} viewedPhase={1} />);
    expect(links()[1]).toHaveAttribute("aria-current", "page");
    rerender(<PhaseTimeline code="PRY-EJ-001" currentPhase={3} viewedPhase={2} />);
    expect(links()[1]).not.toHaveAttribute("aria-current");
    expect(links()[2]).toHaveAttribute("aria-current", "page");
  });

  it("Tab goes through the 8 phases in order", async () => {
    const user = userEvent.setup();
    render(<PhaseTimeline code="PRY-EJ-001" currentPhase={3} viewedPhase={3} />);
    for (const l of links()) {
      await user.tab();
      expect(l).toHaveFocus();
    }
  });

  it("Enter on a focused phase activates its link", async () => {
    const user = userEvent.setup();
    render(<PhaseTimeline code="PRY-EJ-001" currentPhase={3} viewedPhase={3} />);
    const target = links()[5];
    const onClick = jest.fn((e: Event) => e.preventDefault());
    target.addEventListener("click", onClick);
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    expect(target).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it.each<[PhaseId, PhaseId]>([
    [0, 0],
    [7, 7],
    [0, 7],
    [7, 0],
  ])("edge case: current phase %i, phase on screen %i", (current, viewed) => {
    render(<PhaseTimeline code="PRY-EJ-001" currentPhase={current} viewedPhase={viewed} />);
    const ls = links();
    expect(ls).toHaveLength(8);
    expect(ls.filter((l) => l.hasAttribute("aria-current"))).toEqual([ls[viewed]]);
    ls.forEach((l, i) => {
      const e = i < current ? "done" : i === current ? "current" : "upcoming";
      expect(stateOf(l)).toEqual([e]);
    });
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<PhaseTimeline code="PRY-EJ-001" currentPhase={3} viewedPhase={5} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
