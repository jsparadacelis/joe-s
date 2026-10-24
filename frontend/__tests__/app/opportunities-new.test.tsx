import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import Page, { metadata } from "@/app/opportunities/new/page";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe("/opportunities/new", () => {
  it("has the title «Nueva oportunidad» in the metadata", () => {
    expect(metadata.title).toBe("Nueva oportunidad");
  });

  it("renders PageHead with a single h1 and the form", () => {
    render(<Page />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Nueva oportunidad" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Nueva oportunidad" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
  });

  it("no accessibility violations", async () => {
    const { container } = render(
      <main>
        <Page />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
