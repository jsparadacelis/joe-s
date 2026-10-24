import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReliefViewer } from "@/components/project/relief/ReliefViewer";
import { mountScene } from "@/lib/relief-scene";
import type { ReliefOptions } from "@/lib/relief";
import { slopedPlane } from "../../../helpers/relief-plane";

// jsdom has no WebGL: the scene module is replaced by a fake.
jest.mock("@/lib/relief-scene", () => ({
  mountScene: jest.fn(() => ({
    reset: jest.fn(),
    zoomIn: jest.fn(),
    zoomOut: jest.fn(),
    updateExaggeration: jest.fn(),
    release: jest.fn(),
  })),
}));

const REF = "1234567DG3413S0001AB";
const fetcher = () => jest.fn(async (o: ReliefOptions) => slopedPlane({ reference: o.reference }));

beforeEach(() => (mountScene as jest.Mock).mockClear());

describe("ReliefViewer · reference input", () => {
  it("trims a pasted reference with surrounding spaces and queries with the trimmed value", async () => {
    const user = userEvent.setup();
    const obtain = fetcher();
    render(<ReliefViewer initialReference="" fetcher={obtain} />);
    const field = screen.getByLabelText("Referencia catastral");
    await user.click(field);
    await user.paste(`  ${REF}  `);
    await user.click(screen.getByRole("button", { name: "Ver relieve" }));
    await waitFor(() => expect(mountScene).toHaveBeenCalledTimes(1));
    expect(obtain).toHaveBeenCalledWith({ reference: REF, margin: 25, maxSide: 200 });
    expect(field).toHaveValue(REF);
    expect(screen.queryByText("La referencia catastral debe tener 20 caracteres.")).not.toBeInTheDocument();
  });

  it("marks the field aria-invalid with an invalid reference and clears it after a valid one", async () => {
    const user = userEvent.setup();
    render(<ReliefViewer initialReference="" fetcher={fetcher()} />);
    const field = screen.getByLabelText("Referencia catastral");
    expect(field).toHaveAttribute("aria-invalid", "false");
    await user.type(field, "ABC");
    await user.click(screen.getByRole("button", { name: "Ver relieve" }));
    expect(await screen.findByText("La referencia catastral debe tener 20 caracteres.")).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("La referencia catastral debe tener 20 caracteres.");
    await user.clear(field);
    await user.type(field, REF);
    await user.click(screen.getByRole("button", { name: "Ver relieve" }));
    await waitFor(() => expect(field).toHaveAttribute("aria-invalid", "false"));
  });
});
