import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import ToPromotePage, { metadata } from "@/app/to-promote/page";
import { API_TO_PROMOTE } from "../helpers/to-promote-fixtures";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Contract: the page is a server-safe shell (PageHead + client `ToPromoteView`) that reads
// GET /api/to-promote from the browser through the default API client, like /portfolio.
function mockApi(body: unknown, status = 200) {
  const fetchMock = jest.fn().mockResolvedValue({ ok: status < 300, status, text: async () => JSON.stringify(body) });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const originalFetch = globalThis.fetch;
afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe("/to-promote", () => {
  it("has the title «Por promover» in the metadata", () => {
    expect(metadata.title).toBe("Por promover");
  });

  it("renders PageHead with a single h1 and its description", async () => {
    mockApi(API_TO_PROMOTE);
    render(<ToPromotePage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Por promover" })).toBeInTheDocument();
    expect(screen.getByText("Proyectos con el entregable listo para pasar a la siguiente fase.")).toBeInTheDocument();
    await screen.findByRole("table");
  });

  it("shows the real list read from GET /api/to-promote", async () => {
    const fetchMock = mockApi(API_TO_PROMOTE);
    render(<ToPromotePage />);
    const table = await screen.findByRole("table", { name: "Proyectos por promover" });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/to-promote$/);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("GET");
    expect(within(table).getByRole("link", { name: /PRY-2026-001/ })).toHaveAttribute("href", "/projects/PRY-2026-001");
    expect(within(table).getAllByText("Listo para promover")).toHaveLength(2);
    expect(within(table).getByText("Bloqueado")).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(1 + API_TO_PROMOTE.projects.length);
  });

  it("empty list: «No hay proyectos por promover»", async () => {
    mockApi({ ready_count: 0, projects: [] });
    render(<ToPromotePage />);
    expect(await screen.findByText("No hay proyectos por promover")).toBeInTheDocument();
  });

  it("server error: shows its message and «Reintentar»", async () => {
    mockApi({ detail: { code: "service_unavailable", message: "El servicio no está disponible." } }, 503);
    render(<ToPromotePage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("El servicio no está disponible.");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("malformed response: shows the invalid-response message", async () => {
    mockApi({ nope: true });
    render(<ToPromotePage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("La respuesta del servidor no es válida. Inténtalo de nuevo.");
  });

  it("has no accessibility violations", async () => {
    mockApi(API_TO_PROMOTE);
    const { container } = render(<ToPromotePage />);
    await screen.findByRole("table");
    expect(await axe(container)).toHaveNoViolations();
  });
});
