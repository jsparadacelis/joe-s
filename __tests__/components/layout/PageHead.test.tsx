import { render, screen } from "@testing-library/react";
import { PageHead } from "@/components/layout/PageHead";

describe("PageHead", () => {
  it("muestra el título como h1, la descripción y las acciones", () => {
    render(<PageHead title="Cartera" description="Resumen" actions={<button type="button">Nuevo</button>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Cartera" })).toBeInTheDocument();
    expect(screen.getByText("Resumen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuevo" })).toBeInTheDocument();
  });
});
