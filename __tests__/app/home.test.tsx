import HomePage from "@/app/page";

const mockRedirect = jest.fn();
jest.mock("next/navigation", () => ({ redirect: (to: string) => mockRedirect(to) }));

it("/ redirige a /cartera", () => {
  HomePage();
  expect(mockRedirect).toHaveBeenCalledWith("/cartera");
});
