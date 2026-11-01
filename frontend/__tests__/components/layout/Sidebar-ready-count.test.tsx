import { render, screen, waitFor, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { Sidebar } from "@/components/layout/Sidebar";
import { NAV_ITEMS } from "@/lib/nav";
import { API_TO_PROMOTE } from "../../helpers/to-promote-fixtures";

// Contract: the Sidebar renders `<ReadyCountBadge />` inside the «Por promover» link only.
const mockPathname = jest.fn();
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname() }));

const originalFetch = globalThis.fetch;
function mockApi(body: unknown, status = 200) {
  const fetchMock = jest.fn().mockResolvedValue({ ok: status < 300, status, text: async () => JSON.stringify(body) });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => mockPathname.mockReturnValue("/portfolio"));
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Sidebar ready-count badge", () => {
  it("shows the count inside the «Por promover» link and in no other link", async () => {
    mockApi(API_TO_PROMOTE);
    render(<Sidebar />);
    const badge = await screen.findByLabelText("2 proyectos listos para promover");
    const link = screen.getByRole("link", { name: /Por promover/ });
    expect(link).toContainElement(badge);
    expect(link).toHaveAccessibleName(/2 proyectos listos para promover/);
    expect(screen.getAllByLabelText(/listos? para promover/)).toHaveLength(1);
    for (const other of screen.getAllByRole("link").filter((l) => l !== link)) {
      expect(within(other).queryByLabelText(/para promover/)).not.toBeInTheDocument();
    }
  });

  it("uses the singular for one ready project", async () => {
    mockApi({ ...API_TO_PROMOTE, ready_count: 1 });
    render(<Sidebar />);
    expect(await screen.findByLabelText("1 proyecto listo para promover")).toBeInTheDocument();
  });

  it("shows no badge when there are none ready", async () => {
    const fetchMock = mockApi({ ready_count: 0, projects: [] });
    render(<Sidebar />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByLabelText(/para promover/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Por promover" })).toBeInTheDocument();
  });

  it("does not break the sidebar when the API fails", async () => {
    const fetchMock = mockApi({ detail: { code: "service_unavailable", message: "No disponible" } }, 503);
    render(<Sidebar />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByLabelText(/para promover/)).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Principal" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(NAV_ITEMS.length);
  });

  it("refreshes the count when the route changes", async () => {
    const fetchMock = mockApi(API_TO_PROMOTE);
    const { rerender } = render(<Sidebar />);
    await screen.findByLabelText("2 proyectos listos para promover");
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ ...API_TO_PROMOTE, ready_count: 1 }) });
    mockPathname.mockReturnValue("/projects");
    rerender(<Sidebar />);
    expect(await screen.findByLabelText("1 proyecto listo para promover")).toBeInTheDocument();
  });

  it("has no accessibility violations with the badge", async () => {
    mockApi(API_TO_PROMOTE);
    const { container } = render(<Sidebar />);
    await screen.findByLabelText("2 proyectos listos para promover");
    expect(await axe(container)).toHaveNoViolations();
  });
});
