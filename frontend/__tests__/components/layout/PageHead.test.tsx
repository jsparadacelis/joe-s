import { render, screen } from "@testing-library/react";
import { PageHead } from "@/components/layout/PageHead";

describe("PageHead", () => {
  it("shows the title as h1, the description and the actions", () => {
    render(<PageHead title="Cartera" description="Resumen" actions={<button type="button">New</button>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Cartera" })).toBeInTheDocument();
    expect(screen.getByText("Resumen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  });
});
