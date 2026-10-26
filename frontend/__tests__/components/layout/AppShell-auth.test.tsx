/**
 * RGB-2b · AppShell hides the application chrome (Sidebar and Topbar) on the access screens
 * /login, /login/mfa (exact paths, with or without trailing slash): the content is still rendered inside <main>.
 * On any other path the chrome is shown as before.
 */
import { render, screen } from "@testing-library/react";
import { AppShell } from "@/components/layout/AppShell";

const mockPathname = jest.fn();
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname() }));

describe("AppShell · access screens", () => {
  it.each(["/login", "/login/mfa", "/login/"])("shows only the content on %s", (path) => {
    mockPathname.mockReturnValue(path);
    render(<AppShell><p>Contenido</p></AppShell>);
    expect(screen.getByRole("main")).toHaveTextContent("Contenido");
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("keeps the chrome on a normal page", () => {
    mockPathname.mockReturnValue("/portfolio");
    render(<AppShell><p>Contenido</p></AppShell>);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getAllByRole("navigation").length).toBeGreaterThan(0);
  });

  it("keeps the chrome on a lookalike path", () => {
    mockPathname.mockReturnValue("/loginx");
    render(<AppShell><p>Contenido</p></AppShell>);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });
});
