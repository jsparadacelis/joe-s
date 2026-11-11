/** RGB-53b · the Topbar renders the «Invitar a alguien» button to the left of the account, also without account. */
import { render, screen } from "@testing-library/react";
import { Topbar } from "@/components/layout/Topbar";

jest.mock("next/navigation", () => ({ usePathname: () => "/portfolio" }));

describe("Topbar invite button", () => {
  it("renders the button without an account (dev mode)", () => {
    render(<Topbar />);
    expect(screen.getByRole("button", { name: "Invitar a alguien" })).toBeInTheDocument();
  });

  it("renders the button before the account in the DOM order", () => {
    render(<Topbar account={<div data-testid="account">Cuenta</div>} />);
    const button = screen.getByRole("button", { name: "Invitar a alguien" });
    const account = screen.getByTestId("account");
    expect(button.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
