import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatosTecnicosEditor } from "@/components/proyecto/datos-tecnicos/DatosTecnicosEditor";

const REF = "1234567DG3413S0001AB";

describe("DatosTecnicosEditor · fallo de la consulta (ruta manual)", () => {
  it("avisa del fallo y permite introducir los datos manualmente, sin marcas de editado", async () => {
    const consultar = jest.fn().mockRejectedValue(new Error("sin servicio"));
    const user = userEvent.setup();
    render(<DatosTecnicosEditor referenciaCatastral={REF} inicial={null} modo="edicion" consultar={consultar} />);

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
