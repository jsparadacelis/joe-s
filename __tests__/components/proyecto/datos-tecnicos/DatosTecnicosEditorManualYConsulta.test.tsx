import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatosTecnicosEditor } from "@/components/proyecto/datos-tecnicos/DatosTecnicosEditor";
import { obtenerDatosTecnicos } from "@/lib/datos-tecnicos";

jest.setTimeout(20000);
const REF = "1234567DG3413S0001AB";

describe("DatosTecnicosEditor · ruta manual y consulta posterior (regresión)", () => {
  it("tras la ruta manual, una consulta correcta rellena parcela y condiciones y conserva planeamiento", async () => {
    const consultar = jest
      .fn()
      .mockRejectedValueOnce(new Error("sin servicio"))
      .mockImplementationOnce(obtenerDatosTecnicos);
    const user = userEvent.setup();
    render(<DatosTecnicosEditor referenciaCatastral={REF} inicial={null} modo="edicion" consultar={consultar} />);

    await user.click(screen.getByRole("button", { name: "Obtener datos técnicos" }));
    await user.click(await screen.findByRole("button", { name: "Introducir datos manualmente" }));

    await user.type(screen.getByLabelText(/^Dirección/), "CL MANUAL 1");
    await user.type(screen.getByLabelText(/^Edificabilidad/), "2");
    await user.selectOptions(screen.getByLabelText(/^Superficie de cálculo/), "Polígono");

    // Sin marcas engañosas en lo introducido a mano.
    const fila = screen.getByLabelText(/^Dirección/).closest("li") as HTMLElement;
    expect(within(fila).queryByText("Editado")).not.toBeInTheDocument();
    expect(fila).not.toHaveTextContent("Valor de");

    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    await screen.findByDisplayValue("CL EJEMPLO 12");

    expect(screen.getByLabelText(/^Municipio/)).toHaveValue("VIC (BARCELONA)");
    expect(screen.getByLabelText(/^Zona climática/)).toHaveValue("D2");
    expect(screen.getByLabelText(/^Edificabilidad/)).toHaveValue("2");
    expect(screen.getByLabelText(/^Superficie de cálculo/)).toHaveValue("Polígono");
    expect(screen.queryByText("Editado")).not.toBeInTheDocument();
  });
});
