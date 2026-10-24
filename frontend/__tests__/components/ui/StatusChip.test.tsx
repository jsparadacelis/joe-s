import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { StatusChip } from "@/components/ui/StatusChip";

describe("StatusChip", () => {
  it("tag variant uses the soft colour of the tone", () => {
    render(<StatusChip tone="ok">Aprobado</StatusChip>);
    expect(screen.getByText("Aprobado")).toHaveClass("bg-ok-soft", "text-ok");
  });

  it("traffic-light variant includes a decorative dot", () => {
    render(<StatusChip variant="traffic-light" tone="bad">En riesgo</StatusChip>);
    const chip = screen.getByText("En riesgo");
    const dot = chip.querySelector("span");
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).toHaveClass("bg-bad");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<StatusChip tone="warn" variant="traffic-light">Atención</StatusChip>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
