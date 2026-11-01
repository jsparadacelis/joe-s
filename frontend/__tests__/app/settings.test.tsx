import { render, screen } from "@testing-library/react";
import SettingsPage from "@/app/settings/page";

// The editor talks to the API; its own tests cover that. Here only the page composition is checked.
jest.mock("@/components/settings/PlanSettingsEditor", () => ({
  PlanSettingsEditor: () => <div data-testid="plan-settings-editor" />,
}));

jest.mock("@/components/settings/ScoringSettingsEditor", () => ({
  ScoringSettingsEditor: () => <div data-testid="scoring-settings-editor" />,
}));

jest.mock("@/components/settings/TeamEditor", () => ({
  TeamEditor: () => <div data-testid="team-editor" />,
}));

describe("page /settings", () => {
  it("renders the scoring settings editor (RGB-14)", () => {
    render(<SettingsPage />);
    expect(screen.getByTestId("scoring-settings-editor")).toBeInTheDocument();
  });

  it("renders the PageHead with title and description", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Ajustes y equipo" })).toBeInTheDocument();
    expect(screen.getByText("Configuración general y gestión del equipo.")).toBeInTheDocument();
  });

  it("renders the plan settings editor", () => {
    render(<SettingsPage />);
    expect(screen.getByTestId("plan-settings-editor")).toBeInTheDocument();
  });

  it("renders the study team editor (RGB-48) after the plan and scoring settings", () => {
    render(<SettingsPage />);
    const team = screen.getByTestId("team-editor");
    expect(team).toBeInTheDocument();
    const scoring = screen.getByTestId("scoring-settings-editor");
    expect(scoring.compareDocumentPosition(team) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("is no longer an empty state", () => {
    render(<SettingsPage />);
    expect(screen.queryByText(/nada configurado todavía/i)).not.toBeInTheDocument();
  });
});
