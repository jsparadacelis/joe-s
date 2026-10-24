import HomePage from "@/app/page";

const mockRedirect = jest.fn();
jest.mock("next/navigation", () => ({ redirect: (to: string) => mockRedirect(to) }));

it("/ redirects to /portfolio", () => {
  HomePage();
  expect(mockRedirect).toHaveBeenCalledWith("/portfolio");
});
