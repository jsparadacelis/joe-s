import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { Topbar } from "@/components/layout/Topbar";

const mockPathname = jest.fn();
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname() }));

describe("Topbar", () => {
  it("shows the breadcrumbs with the current section", () => {
    mockPathname.mockReturnValue("/weekly-report");
    render(<Topbar />);
    expect(screen.getByRole("navigation", { name: "Migas de pan" })).toBeInTheDocument();
    expect(screen.getByText("Reporte semanal")).toHaveAttribute("aria-current", "page");
  });

  it("only shows the root on unknown routes", () => {
    mockPathname.mockReturnValue("/other");
    render(<Topbar />);
    expect(screen.getByText("RGB Proyectos")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("has no accessibility violations", async () => {
    mockPathname.mockReturnValue("/portfolio");
    const { container } = render(<Topbar />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
