import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { StatusChip } from "@/components/ui/StatusChip";

describe("StatusChip", () => {
  it("variante tag usa el color suave del tono", () => {
    render(<StatusChip tone="ok">Aprobado</StatusChip>);
    expect(screen.getByText("Aprobado")).toHaveClass("bg-ok-soft", "text-ok");
  });

  it("variante semáforo incluye un punto decorativo", () => {
    render(<StatusChip variant="traffic-light" tone="bad">En riesgo</StatusChip>);
    const chip = screen.getByText("En riesgo");
    const dot = chip.querySelector("span");
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).toHaveClass("bg-bad");
  });

  it("no tiene violaciones de accesibilidad", async () => {
    const { container } = render(<StatusChip tone="warn" variant="traffic-light">Atención</StatusChip>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
