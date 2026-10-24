import { render, screen } from "@testing-library/react";
import PortfolioPage from "@/app/cartera/page";
import ToPromotePage from "@/app/por-promover/page";
import WeeklyReportPage from "@/app/reporte-semanal/page";
import SettingsPage from "@/app/ajustes/page";

const pages = [
  ["Cartera", PortfolioPage],
  ["Por promover", ToPromotePage],
  ["Reporte semanal", WeeklyReportPage],
  ["Ajustes y equipo", SettingsPage],
] as const;

describe.each(pages)("page %s", (title, Page) => {
  it("shows its header and an empty state", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText(/aún no hay|no hay|nada configurado/i)).toBeInTheDocument();
  });
});
