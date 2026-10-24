import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { PortfolioFilters } from "@/components/portfolio/PortfolioFilters";
import { ALL_FILTER, type PortfolioFilter } from "@/lib/portfolio";

const OWNERS = ["Ana Test", "Beto Test", "Carla Test"];
const NONE: PortfolioFilter = { status: ALL_FILTER, owner: ALL_FILTER };

const optionNames = (select: HTMLElement) => within(select).getAllByRole("option").map((o) => o.textContent);

describe("PortfolioFilters", () => {
  it("is a group named «Filtros de la cartera» with two labelled selects", () => {
    render(<PortfolioFilters owners={OWNERS} value={NONE} onChange={jest.fn()} />);
    const group = screen.getByRole("group", { name: "Filtros de la cartera" });
    expect(within(group).getByRole("combobox", { name: "Semáforo" })).toBeInTheDocument();
    expect(within(group).getByRole("combobox", { name: "Responsable" })).toBeInTheDocument();
  });

  it("the traffic-light select offers «Todos» plus the five statuses in Spanish", () => {
    render(<PortfolioFilters owners={OWNERS} value={NONE} onChange={jest.fn()} />);
    expect(optionNames(screen.getByRole("combobox", { name: "Semáforo" }))).toEqual([
      "Todos",
      "En plazo",
      "Atención",
      "Plan superado",
      "En pausa",
      "Sin plan",
    ]);
  });

  it("the owner select offers «Todos» plus the given owners in the given order", () => {
    render(<PortfolioFilters owners={OWNERS} value={NONE} onChange={jest.fn()} />);
    expect(optionNames(screen.getByRole("combobox", { name: "Responsable" }))).toEqual(["Todos", ...OWNERS]);
  });

  it("shows the current value (controlled)", () => {
    render(<PortfolioFilters owners={OWNERS} value={{ status: "amber", owner: "Beto Test" }} onChange={jest.fn()} />);
    expect(screen.getByRole("combobox", { name: "Semáforo" })).toHaveValue("amber");
    expect(screen.getByRole("combobox", { name: "Responsable" })).toHaveValue("Beto Test");
  });

  it("with no filter both selects show «Todos» (value 'all')", () => {
    render(<PortfolioFilters owners={OWNERS} value={NONE} onChange={jest.fn()} />);
    expect(screen.getByRole("combobox", { name: "Semáforo" })).toHaveValue(ALL_FILTER);
    expect(screen.getByRole("combobox", { name: "Responsable" })).toHaveValue(ALL_FILTER);
  });

  it("changing the status calls onChange with the new status and keeps the owner", async () => {
    const onChange = jest.fn();
    render(<PortfolioFilters owners={OWNERS} value={{ status: ALL_FILTER, owner: "Ana Test" }} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Semáforo" }), "En pausa");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ status: "paused", owner: "Ana Test" });
  });

  it("changing the owner calls onChange with the new owner and keeps the status", async () => {
    const onChange = jest.fn();
    render(<PortfolioFilters owners={OWNERS} value={{ status: "red", owner: ALL_FILTER }} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Responsable" }), "Carla Test");
    expect(onChange).toHaveBeenCalledWith({ status: "red", owner: "Carla Test" });
  });

  it("going back to «Todos» emits the 'all' sentinel", async () => {
    const onChange = jest.fn();
    render(<PortfolioFilters owners={OWNERS} value={{ status: "green", owner: "Ana Test" }} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Semáforo" }), "Todos");
    expect(onChange).toHaveBeenCalledWith({ status: ALL_FILTER, owner: "Ana Test" });
  });

  it("the selects are reachable by keyboard in order", async () => {
    render(<PortfolioFilters owners={OWNERS} value={NONE} onChange={jest.fn()} />);
    await userEvent.tab();
    expect(screen.getByRole("combobox", { name: "Semáforo" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("combobox", { name: "Responsable" })).toHaveFocus();
  });

  it("no owners: still renders the select with only «Todos»", () => {
    render(<PortfolioFilters owners={[]} value={NONE} onChange={jest.fn()} />);
    expect(optionNames(screen.getByRole("combobox", { name: "Responsable" }))).toEqual(["Todos"]);
  });

  it("no accessibility violations", async () => {
    const { container } = render(
      <main>
        <PortfolioFilters owners={OWNERS} value={NONE} onChange={jest.fn()} />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
