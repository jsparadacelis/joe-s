import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { Notice } from "@/components/ui/Notice";

describe("Notice", () => {
  it("uses role=status for informational notices", () => {
    render(<Notice>Guardado</Notice>);
    expect(screen.getByRole("status")).toHaveTextContent("Guardado");
  });

  it("uses role=alert for errors", () => {
    render(<Notice tone="bad">Falló la consulta</Notice>);
    expect(screen.getByRole("alert")).toHaveClass("bg-bad-soft");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<Notice tone="warn">Revisa los datos</Notice>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
