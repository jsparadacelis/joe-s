import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { Sidebar } from "@/components/layout/Sidebar";
import { NAV_ITEMS } from "@/lib/nav";

const mockPathname = jest.fn();
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname() }));

describe("Sidebar", () => {
  it("lista todos los ítems de navegación", () => {
    mockPathname.mockReturnValue("/cartera");
    render(<Sidebar />);
    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(nav).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(NAV_ITEMS.length);
  });

  it("marca solo el ítem activo con aria-current=page", () => {
    mockPathname.mockReturnValue("/por-promover");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Por promover" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Cartera" })).not.toHaveAttribute("aria-current");
  });

  it("no tiene violaciones de accesibilidad", async () => {
    mockPathname.mockReturnValue("/ajustes");
    const { container } = render(<Sidebar />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
