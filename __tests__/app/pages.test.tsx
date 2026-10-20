import { render, screen } from "@testing-library/react";
import CarteraPage from "@/app/cartera/page";
import ProyectosPage from "@/app/proyectos/page";
import PorPromoverPage from "@/app/por-promover/page";
import ReportePage from "@/app/reporte-semanal/page";
import AjustesPage from "@/app/ajustes/page";

const pages = [
  ["Cartera", CarteraPage],
  ["Proyectos", ProyectosPage],
  ["Por promover", PorPromoverPage],
  ["Reporte semanal", ReportePage],
  ["Ajustes y equipo", AjustesPage],
] as const;

describe.each(pages)("página %s", (title, Page) => {
  it("muestra su cabecera y un estado vacío", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText(/aún no hay|no hay|nada configurado/i)).toBeInTheDocument();
  });
});
