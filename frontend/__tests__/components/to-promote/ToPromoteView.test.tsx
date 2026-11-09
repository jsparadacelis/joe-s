import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { ToPromoteView } from "@/components/to-promote/ToPromoteView";
import { ApiError } from "@/lib/api";
import { TO_PROMOTE } from "../../helpers/to-promote-fixtures";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const UNEXPECTED = "Ocurrió un error inesperado. Inténtalo de nuevo.";

function setup(fetcher: jest.Mock = jest.fn().mockResolvedValue(TO_PROMOTE)) {
  const user = userEvent.setup();
  return { fetcher, user, ...render(<ToPromoteView fetcher={fetcher} />) };
}

describe("ToPromoteView", () => {
  it("loading: shows a status text and no table nor empty message", () => {
    setup(jest.fn(() => new Promise(() => {})));
    expect(screen.getByText("Cargando los proyectos por promover…")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("No hay proyectos por promover")).not.toBeInTheDocument();
  });

  it("loading: the text is announced as a status (role=status)", () => {
    setup(jest.fn(() => new Promise(() => {})));
    expect(screen.getByRole("status")).toHaveTextContent("Cargando los proyectos por promover…");
  });

  it("calls the fetcher once on mount and shows the table", async () => {
    const { fetcher } = setup();
    expect(await screen.findByRole("table", { name: "Proyectos por promover" })).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Cargando los proyectos por promover…")).not.toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(1 + TO_PROMOTE.projects.length);
  });

  it("empty: «No hay proyectos por promover»", async () => {
    setup(jest.fn().mockResolvedValue({ readyCount: 0, projects: [] }));
    expect(await screen.findByText("No hay proyectos por promover")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it.each([
    [401, "Tu sesión no es válida o ha caducado. Entra de nuevo."],
    [403, "No tienes permiso para ver esta lista."],
    [503, "El servicio no está disponible. Inténtalo más tarde."],
  ])("error %s: alert with the server message and «Reintentar»", async (status, message) => {
    setup(jest.fn().mockRejectedValue(new ApiError(status, "some_code", message)));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Cargando los proyectos por promover…")).not.toBeInTheDocument();
  });

  it("error that is not an ApiError: generic message without internal detail", async () => {
    setup(jest.fn().mockRejectedValue(new Error("boom internal detail")));
    expect(await screen.findByRole("alert")).toHaveTextContent(UNEXPECTED);
    expect(screen.queryByText(/boom internal detail/)).not.toBeInTheDocument();
  });

  it("«Reintentar» fetches again and shows the table when it works", async () => {
    const fetcher = jest.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue(TO_PROMOTE);
    const { user } = setup(fetcher);
    await user.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("table", { name: "Proyectos por promover" })).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("«Reintentar» that fails again keeps the error", async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error("x"));
    const { user } = setup(fetcher);
    await user.click(await screen.findByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toHaveTextContent(UNEXPECTED);
  });

  it("has no accessibility violations: loading, table, empty and error", async () => {
    const loading = setup(jest.fn(() => new Promise(() => {})));
    expect(await axe(loading.container)).toHaveNoViolations();
    loading.unmount();

    const table = setup();
    await screen.findByRole("table");
    expect(await axe(table.container)).toHaveNoViolations();
    table.unmount();

    const empty = setup(jest.fn().mockResolvedValue({ readyCount: 0, projects: [] }));
    await screen.findByText("No hay proyectos por promover");
    expect(await axe(empty.container)).toHaveNoViolations();
    empty.unmount();

    const failed = setup(jest.fn().mockRejectedValue(new Error("x")));
    await screen.findByRole("alert");
    expect(await axe(failed.container)).toHaveNoViolations();
  });
});
