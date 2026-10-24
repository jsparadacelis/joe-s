import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { Sidebar } from "@/components/layout/Sidebar";
import { NAV_ITEMS } from "@/lib/nav";

const mockPathname = jest.fn();
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname() }));

describe("Sidebar", () => {
  it("lists all the navigation items", () => {
    mockPathname.mockReturnValue("/cartera");
    render(<Sidebar />);
    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(nav).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(NAV_ITEMS.length);
  });

  it("marks only the active item with aria-current=page", () => {
    mockPathname.mockReturnValue("/por-promover");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Por promover" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Cartera" })).not.toHaveAttribute("aria-current");
  });

  it("has no accessibility violations", async () => {
    mockPathname.mockReturnValue("/ajustes");
    const { container } = render(<Sidebar />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
