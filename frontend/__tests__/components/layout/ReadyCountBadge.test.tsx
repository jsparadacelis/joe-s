import { render, screen, waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { ReadyCountBadge } from "@/components/layout/ReadyCountBadge";
import { ApiError } from "@/lib/api";
import type { ToPromote } from "@/lib/to-promote";
import { API_TO_PROMOTE } from "../../helpers/to-promote-fixtures";

// Contract: `ReadyCountBadge` is a client component placed next to «Por promover» in the Sidebar.
// It loads `GET /api/to-promote` (only `readyCount` is used), reloads when the route changes, renders
// nothing for 0 or on failure, and only calls the API when the rest of the app would: auth mode `dev`,
// or `supabase` with a session token (`getSessionToken()` from `@/lib/auth-token`).
const mockPathname = jest.fn();
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname() }));

const mockBrowserToken = jest.fn();
jest.mock("@/lib/supabase/client", () => ({ getBrowserToken: () => mockBrowserToken() }));

const withCount = (readyCount: number): ToPromote => ({ readyCount, projects: [] });
const originalMode = process.env.NEXT_PUBLIC_AUTH_MODE;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_AUTH_MODE; // dev
  mockPathname.mockReturnValue("/portfolio");
  mockBrowserToken.mockReset();
});
afterEach(() => {
  if (originalMode === undefined) delete process.env.NEXT_PUBLIC_AUTH_MODE;
  else process.env.NEXT_PUBLIC_AUTH_MODE = originalMode;
  globalThis.fetch = originalFetch;
});

describe("ReadyCountBadge", () => {
  it("shows the count with a plural accessible name", async () => {
    render(<ReadyCountBadge fetcher={jest.fn().mockResolvedValue(withCount(2))} />);
    const badge = await screen.findByLabelText("2 proyectos listos para promover");
    expect(badge).toHaveTextContent("2");
  });

  it("uses the singular for one project", async () => {
    render(<ReadyCountBadge fetcher={jest.fn().mockResolvedValue(withCount(1))} />);
    expect(await screen.findByLabelText("1 proyecto listo para promover")).toHaveTextContent("1");
  });

  it("renders nothing for 0", async () => {
    const fetcher = jest.fn().mockResolvedValue(withCount(0));
    const { container } = render(<ReadyCountBadge fetcher={fetcher} />);
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while loading", () => {
    const { container } = render(<ReadyCountBadge fetcher={jest.fn(() => new Promise<ToPromote>(() => {}))} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["ApiError", new ApiError(503, "service_unavailable", "No disponible")],
    ["generic error", new Error("boom")],
  ])("renders nothing and does not throw when the load fails (%s)", async (_name, error) => {
    const fetcher = jest.fn().mockRejectedValue(error);
    const { container } = render(<ReadyCountBadge fetcher={fetcher} />);
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("reloads when the route changes and shows the new count", async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(withCount(2)).mockResolvedValueOnce(withCount(1));
    const { rerender } = render(<ReadyCountBadge fetcher={fetcher} />);
    await screen.findByLabelText("2 proyectos listos para promover");
    mockPathname.mockReturnValue("/projects/PRY-2026-001");
    rerender(<ReadyCountBadge fetcher={fetcher} />);
    expect(await screen.findByLabelText("1 proyecto listo para promover")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("hides the badge when a reload after navigating fails", async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(withCount(2)).mockRejectedValueOnce(new Error("down"));
    const { rerender } = render(<ReadyCountBadge fetcher={fetcher} />);
    await screen.findByLabelText("2 proyectos listos para promover");
    mockPathname.mockReturnValue("/settings");
    rerender(<ReadyCountBadge fetcher={fetcher} />);
    await waitFor(() => expect(screen.queryByLabelText(/listos? para promover/)).not.toBeInTheDocument());
  });

  it("ignores a stale response that arrives after a newer one", async () => {
    let resolveFirst: (value: ToPromote) => void = () => {};
    const fetcher = jest
      .fn()
      .mockReturnValueOnce(new Promise<ToPromote>((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(withCount(1));
    const { rerender } = render(<ReadyCountBadge fetcher={fetcher} />);
    mockPathname.mockReturnValue("/settings");
    rerender(<ReadyCountBadge fetcher={fetcher} />);
    await screen.findByLabelText("1 proyecto listo para promover");
    resolveFirst(withCount(5));
    await Promise.resolve();
    expect(screen.getByLabelText("1 proyecto listo para promover")).toBeInTheDocument();
    expect(screen.queryByLabelText("5 proyectos listos para promover")).not.toBeInTheDocument();
  });

  it("does not update state after unmounting", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    let resolve: (value: ToPromote) => void = () => {};
    const { unmount } = render(<ReadyCountBadge fetcher={jest.fn(() => new Promise<ToPromote>((r) => (resolve = r)))} />);
    unmount();
    resolve(withCount(3));
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  describe("when the API is called", () => {
    it("dev mode: calls without looking for a session", async () => {
      const fetcher = jest.fn().mockResolvedValue(withCount(2));
      render(<ReadyCountBadge fetcher={fetcher} />);
      await screen.findByLabelText("2 proyectos listos para promover");
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(mockBrowserToken).not.toHaveBeenCalled();
    });

    it("supabase mode with a session: calls", async () => {
      process.env.NEXT_PUBLIC_AUTH_MODE = "supabase";
      mockBrowserToken.mockResolvedValue("token-abc");
      const fetcher = jest.fn().mockResolvedValue(withCount(2));
      render(<ReadyCountBadge fetcher={fetcher} />);
      await screen.findByLabelText("2 proyectos listos para promover");
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("supabase mode without a session: does not call and renders nothing", async () => {
      process.env.NEXT_PUBLIC_AUTH_MODE = "supabase";
      mockBrowserToken.mockResolvedValue(null);
      const fetcher = jest.fn().mockResolvedValue(withCount(2));
      const { container } = render(<ReadyCountBadge fetcher={fetcher} />);
      await waitFor(() => expect(mockBrowserToken).toHaveBeenCalled());
      await Promise.resolve();
      expect(fetcher).not.toHaveBeenCalled();
      expect(container).toBeEmptyDOMElement();
    });

    it("supabase mode where reading the session throws: does not call and renders nothing", async () => {
      process.env.NEXT_PUBLIC_AUTH_MODE = "supabase";
      mockBrowserToken.mockRejectedValue(new Error("no storage"));
      const fetcher = jest.fn().mockResolvedValue(withCount(2));
      const { container } = render(<ReadyCountBadge fetcher={fetcher} />);
      await waitFor(() => expect(mockBrowserToken).toHaveBeenCalled());
      await Promise.resolve();
      expect(fetcher).not.toHaveBeenCalled();
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("default fetcher (no prop)", () => {
    it("dev mode: GET /api/to-promote through the default client, without Authorization", async () => {
      const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify(API_TO_PROMOTE) });
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      render(<ReadyCountBadge />);
      expect(await screen.findByLabelText("2 proyectos listos para promover")).toBeInTheDocument();
      expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/to-promote$/);
      expect(fetchMock.mock.calls[0][1]?.headers?.Authorization).toBeUndefined();
    });

    it("supabase mode with a session: sends the Bearer token", async () => {
      process.env.NEXT_PUBLIC_AUTH_MODE = "supabase";
      mockBrowserToken.mockResolvedValue("token-abc");
      const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify(API_TO_PROMOTE) });
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      render(<ReadyCountBadge />);
      await screen.findByLabelText("2 proyectos listos para promover");
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer token-abc");
    });

    it("supabase mode without a session: no request at all", async () => {
      process.env.NEXT_PUBLIC_AUTH_MODE = "supabase";
      mockBrowserToken.mockResolvedValue(null);
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      render(<ReadyCountBadge />);
      await waitFor(() => expect(mockBrowserToken).toHaveBeenCalled());
      await Promise.resolve();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a 401/malformed response hides the badge", async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "{}" }) as unknown as typeof fetch;
      const { container } = render(<ReadyCountBadge />);
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
      await Promise.resolve();
      expect(container).toBeEmptyDOMElement();
    });
  });

  it("has no accessibility violations inside a link", async () => {
    const { container } = render(
      <a href="/to-promote">
        Por promover <ReadyCountBadge fetcher={jest.fn().mockResolvedValue(withCount(2))} />
      </a>,
    );
    await screen.findByLabelText("2 proyectos listos para promover");
    expect(await axe(container)).toHaveNoViolations();
  });
});
