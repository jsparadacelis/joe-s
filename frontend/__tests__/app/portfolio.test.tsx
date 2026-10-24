import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import PortfolioPage, { metadata } from "@/app/portfolio/page";

describe("/portfolio", () => {
  it("has the title «Cartera» in the metadata", () => {
    expect(metadata.title).toBe("Cartera");
  });

  it("renders PageHead with a single h1 and its description", async () => {
    render(<PortfolioPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Cartera" })).toBeInTheDocument();
    expect(screen.getByText("Visión general de los proyectos activos y su estado.")).toBeInTheDocument();
    await screen.findByRole("table");
  });

  it("renders the view: summary, filters and the sample projects linked to their current phase", async () => {
    render(<PortfolioPage />);
    expect(await screen.findByRole("table", { name: "Proyectos de la cartera" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Resumen de la cartera" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Filtros de la cartera" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /PRY-EJ-001/ })).toHaveAttribute("href", "/projects/PRY-EJ-001/phase/3");
    expect(screen.queryByText("Aún no hay proyectos en la cartera")).not.toBeInTheDocument();
  });

  it("no accessibility violations once loaded", async () => {
    const { container } = render(
      <main>
        <PortfolioPage />
      </main>,
    );
    await screen.findByRole("table");
    expect(await axe(container)).toHaveNoViolations();
  });
});
