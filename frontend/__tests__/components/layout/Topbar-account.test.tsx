/**
 * RGB-2b · Topbar gets an optional `account?: ReactNode` slot (where the app mounts <SessionBadge />).
 *   - Without it (AUTH_MODE=dev, the default) the header is exactly as before: no button, nothing new.
 *   - With it, the node renders inside the banner landmark, after the breadcrumbs.
 */
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { Topbar } from "@/components/layout/Topbar";

jest.mock("next/navigation", () => ({ usePathname: () => "/portfolio" }));

describe("Topbar · account slot", () => {
  it("shows nothing new in dev mode (no slot)", () => {
    render(<Topbar />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/Cerrar sesión/)).not.toBeInTheDocument();
  });

  it("renders the account node inside the header", () => {
    render(<Topbar account={<span>ana@example.com</span>} />);
    expect(screen.getByRole("banner")).toContainElement(screen.getByText("ana@example.com"));
  });

  it("has no accessibility violations with an account", async () => {
    const { container } = render(<Topbar account={<button type="button">Cerrar sesión</button>} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
