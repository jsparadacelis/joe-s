import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { Notice } from "@/components/ui/Notice";

describe("Notice", () => {
  it("usa role=status para avisos informativos", () => {
    render(<Notice>Guardado</Notice>);
    expect(screen.getByRole("status")).toHaveTextContent("Guardado");
  });

  it("usa role=alert para errores", () => {
    render(<Notice tone="bad">Falló la consulta</Notice>);
    expect(screen.getByRole("alert")).toHaveClass("bg-bad-soft");
  });

  it("no tiene violaciones de accesibilidad", async () => {
    const { container } = render(<Notice tone="warn">Revisa los datos</Notice>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
