import HomePage from "@/app/page";

const mockRedirect = jest.fn();
jest.mock("next/navigation", () => ({ redirect: (to: string) => mockRedirect(to) }));

it("/ redirects to /cartera", () => {
  HomePage();
  expect(mockRedirect).toHaveBeenCalledWith("/cartera");
});
