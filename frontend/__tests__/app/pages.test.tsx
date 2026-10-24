import { render, screen } from "@testing-library/react";
import PortfolioPage from "@/app/portfolio/page";
import ToPromotePage from "@/app/to-promote/page";
import WeeklyReportPage from "@/app/weekly-report/page";

const pages = [
  ["Cartera", PortfolioPage],
  ["Por promover", ToPromotePage],
  ["Reporte semanal", WeeklyReportPage],
] as const;

describe.each(pages)("page %s", (title, Page) => {
  it("shows its header", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
  });
});

// RGB-11: /portfolio is no longer a placeholder (it renders the portfolio view, see portfolio.test.tsx),
// so only the pages that are still placeholders are expected to show an empty state.
describe.each(pages.filter(([title]) => title !== "Cartera"))("placeholder page %s", (_title, Page) => {
  it("shows an empty state", () => {
    render(<Page />);
    expect(screen.getByText(/aún no hay|no hay/i)).toBeInTheDocument();
  });
});
