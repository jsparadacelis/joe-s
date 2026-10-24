import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { ModeBanner } from "@/components/project/ModeBanner";

describe("ModeBanner", () => {
  it("renders nothing in edit mode (current phase)", () => {
    const { container } = render(<ModeBanner code="PRY-EJ-001" currentPhase={3} viewedPhase={3} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("in a previous phase warns of a closed phase and frozen version", () => {
    render(<ModeBanner code="PRY-EJ-001" currentPhase={3} viewedPhase={1} />);
    expect(screen.getByRole("status")).toHaveTextContent("Fase cerrada · versión congelada");
    expect(screen.queryByText(/Vista previa/)).not.toBeInTheDocument();
  });

  it("in a next phase warns that it is a preview and nothing is saved", () => {
    render(<ModeBanner code="PRY-EJ-001" currentPhase={3} viewedPhase={5} />);
    expect(screen.getByRole("status")).toHaveTextContent("Vista previa: nada se guarda en esta fase");
    expect(screen.queryByText(/Fase cerrada/)).not.toBeInTheDocument();
  });

  it.each([
    ["anterior", 1],
    ["siguiente", 5],
  ])("in phase %s offers «Volver a la fase actual» towards the current phase", (_n, upcoming) => {
    render(<ModeBanner code="PRY-EJ-001" currentPhase={3} viewedPhase={upcoming as 1 | 5} />);
    expect(screen.getByRole("link", { name: "Volver a la fase actual" })).toHaveAttribute(
      "href",
      "/proyectos/PRY-EJ-001/fase/3",
    );
  });

  it("the link uses the received code and current phase", () => {
    render(<ModeBanner code="PRY-EJ-003" currentPhase={6} viewedPhase={0} />);
    expect(screen.getByRole("link", { name: "Volver a la fase actual" })).toHaveAttribute(
      "href",
      "/proyectos/PRY-EJ-003/fase/6",
    );
  });

  it("in edit mode there is no back link either", () => {
    render(<ModeBanner code="PRY-EJ-001" currentPhase={0} viewedPhase={0} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it.each([
    ["solo lectura", 2, 0],
    ["vista previa", 2, 7],
  ])("no accessibility violations in %s", async (_n, current, upcoming) => {
    const { container } = render(
      <ModeBanner code="PRY-EJ-001" currentPhase={current as 2} viewedPhase={upcoming as 0} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
