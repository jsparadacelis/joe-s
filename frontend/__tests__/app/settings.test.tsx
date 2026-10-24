import { render, screen } from "@testing-library/react";
import SettingsPage from "@/app/settings/page";

// The editor talks to the API; its own tests cover that. Here only the page composition is checked.
jest.mock("@/components/settings/PlanSettingsEditor", () => ({
  PlanSettingsEditor: () => <div data-testid="plan-settings-editor" />,
}));

describe("page /settings", () => {
  it("renders the PageHead with title and description", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Ajustes y equipo" })).toBeInTheDocument();
    expect(screen.getByText("Configuración general y gestión del equipo.")).toBeInTheDocument();
  });

  it("renders the plan settings editor", () => {
    render(<SettingsPage />);
    expect(screen.getByTestId("plan-settings-editor")).toBeInTheDocument();
  });

  it("is no longer an empty state", () => {
    render(<SettingsPage />);
    expect(screen.queryByText(/nada configurado todavía/i)).not.toBeInTheDocument();
  });
});
