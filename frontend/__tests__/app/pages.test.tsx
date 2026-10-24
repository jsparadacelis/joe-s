import { render, screen } from "@testing-library/react";
import PortfolioPage from "@/app/portfolio/page";
import ToPromotePage from "@/app/to-promote/page";
import WeeklyReportPage from "@/app/weekly-report/page";
import SettingsPage from "@/app/settings/page";

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
