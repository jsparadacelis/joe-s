import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { ModoBanner } from "@/components/proyecto/ModoBanner";

describe("ModoBanner", () => {
  it("no renderiza nada en edición (fase actual)", () => {
    const { container } = render(<ModoBanner codigo="PRY-EJ-001" faseActual={3} faseVista={3} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("en una fase anterior avisa de fase cerrada y versión congelada", () => {
    render(<ModoBanner codigo="PRY-EJ-001" faseActual={3} faseVista={1} />);
    expect(screen.getByRole("status")).toHaveTextContent("Fase cerrada · versión congelada");
    expect(screen.queryByText(/Vista previa/)).not.toBeInTheDocument();
  });

  it("en una fase siguiente avisa de que es vista previa y no se guarda", () => {
    render(<ModoBanner codigo="PRY-EJ-001" faseActual={3} faseVista={5} />);
    expect(screen.getByRole("status")).toHaveTextContent("Vista previa: nada se guarda en esta fase");
    expect(screen.queryByText(/Fase cerrada/)).not.toBeInTheDocument();
  });

  it.each([
    ["anterior", 1],
    ["siguiente", 5],
  ])("en fase %s ofrece «Volver a la fase actual» hacia la fase actual", (_n, vista) => {
    render(<ModoBanner codigo="PRY-EJ-001" faseActual={3} faseVista={vista as 1 | 5} />);
    expect(screen.getByRole("link", { name: "Volver a la fase actual" })).toHaveAttribute(
      "href",
      "/proyectos/PRY-EJ-001/fase/3",
    );
  });

  it("el enlace usa el código y la fase actual recibidos", () => {
    render(<ModoBanner codigo="PRY-EJ-003" faseActual={6} faseVista={0} />);
    expect(screen.getByRole("link", { name: "Volver a la fase actual" })).toHaveAttribute(
      "href",
      "/proyectos/PRY-EJ-003/fase/6",
    );
  });

  it("en edición tampoco hay enlace de volver", () => {
    render(<ModoBanner codigo="PRY-EJ-001" faseActual={0} faseVista={0} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it.each([
    ["solo lectura", 2, 0],
    ["vista previa", 2, 7],
  ])("sin violaciones de accesibilidad en %s", async (_n, actual, vista) => {
    const { container } = render(
      <ModoBanner codigo="PRY-EJ-001" faseActual={actual as 2} faseVista={vista as 0} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
