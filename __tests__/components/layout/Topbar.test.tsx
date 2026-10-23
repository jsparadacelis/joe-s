import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { Topbar } from "@/components/layout/Topbar";

const mockPathname = jest.fn();
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname() }));

describe("Topbar", () => {
  it("muestra las migas con la sección actual", () => {
    mockPathname.mockReturnValue("/reporte-semanal");
    render(<Topbar />);
    expect(screen.getByRole("navigation", { name: "Migas de pan" })).toBeInTheDocument();
    expect(screen.getByText("Reporte semanal")).toHaveAttribute("aria-current", "page");
  });

  it("solo muestra la raíz en rutas desconocidas", () => {
    mockPathname.mockReturnValue("/otra");
    render(<Topbar />);
    expect(screen.getByText("RGB Proyectos")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("no tiene violaciones de accesibilidad", async () => {
    mockPathname.mockReturnValue("/cartera");
    const { container } = render(<Topbar />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
