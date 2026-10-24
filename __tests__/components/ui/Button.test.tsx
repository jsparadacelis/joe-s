import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { Button } from "@/components/ui/Button";

describe("Button", () => {
  it("is type=button by default", () => {
    render(<Button>Guardar</Button>);
    expect(screen.getByRole("button", { name: "Guardar" })).toHaveAttribute("type", "button");
  });

  it("fires onClick and does not when disabled", async () => {
    const onClick = jest.fn();
    const { rerender } = render(<Button onClick={onClick}>Ir</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<Button onClick={onClick} disabled>Ir</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies variants through tokens", () => {
    render(<Button variant="point" size="sm">Acento</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-point", "text-on-point");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<Button>Aceptar</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
