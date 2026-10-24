import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { AppShell } from "@/components/layout/AppShell";

jest.mock("next/navigation", () => ({ usePathname: () => "/cartera" }));

describe("AppShell", () => {
  it("composes sidebar, header and main content", () => {
    render(<AppShell><p>Hola</p></AppShell>);
    expect(screen.getByRole("navigation", { name: "Principal" })).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Hola");
    expect(screen.getByRole("link", { name: "Saltar al contenido" })).toHaveAttribute("href", "#contenido");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<AppShell><h1>Título</h1></AppShell>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
