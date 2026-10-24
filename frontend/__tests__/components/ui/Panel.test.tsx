import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { Panel } from "@/components/ui/Panel";

describe("Panel", () => {
  it("shows title, description and content", () => {
    render(<Panel title="Resumen" description="Detalle"><p>Contenido</p></Panel>);
    expect(screen.getByRole("heading", { level: 2, name: "Resumen" })).toBeInTheDocument();
    expect(screen.getByText("Detalle")).toBeInTheDocument();
    expect(screen.getByText("Contenido")).toBeInTheDocument();
  });

  it("allows heading level 3", () => {
    render(<Panel title="Sub" headingLevel={3} />);
    expect(screen.getByRole("heading", { level: 3 })).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<Panel title="Resumen">Texto</Panel>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
