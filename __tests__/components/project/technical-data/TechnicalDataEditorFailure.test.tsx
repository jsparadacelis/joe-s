import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TechnicalDataEditor } from "@/components/project/technical-data/TechnicalDataEditor";

const REF = "1234567DG3413S0001AB";

describe("TechnicalDataEditor · query failure (manual path)", () => {
  it("warns of the failure and allows entering the data manually, without edited marks", async () => {
    const query = jest.fn().mockRejectedValue(new Error("sin servicio"));
    const user = userEvent.setup();
    render(<TechnicalDataEditor cadastralReference={REF} initial={null} mode="edit" query={query} />);

    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    expect(await screen.findByText(/No se pudo consultar/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Obtener datos técnicos" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Introducir datos manualmente" }));
    expect(screen.getByRole("heading", { name: "Parcela" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(26);

    await user.type(screen.getByLabelText(/^Dirección/), "CL MANUAL 1");
    expect(screen.queryByText("Editado")).not.toBeInTheDocument();
    expect(screen.queryByText("No se pudo consultar. Puedes introducir los datos manualmente.")).not.toBeInTheDocument();
  });
});
