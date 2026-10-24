import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { PhaseDeliverableForm } from "@/components/project/PhaseDeliverableForm";
import type { PhaseDeliverable } from "@/lib/projects";

const deliverable = (over: Partial<PhaseDeliverable> = {}): PhaseDeliverable => ({
  phase: 2,
  frozenVersion: null,
  fields: [
    { id: "title", label: "Briefing title", type: "text", value: "Sample dwelling" },
    { id: "notes", label: "Concept notes", type: "textarea", value: "Sample text" },
    { id: "entrega", label: "Delivery date", type: "date", value: "2026-03-01" },
  ],
  ...over,
});

const LABELS = ["Briefing title", "Concept notes", "Delivery date"];
const blocked = (el: HTMLElement) =>
  (el as HTMLInputElement).readOnly === true || (el as HTMLInputElement).disabled === true;

describe("PhaseDeliverableForm · edit", () => {
  it("shows the three field types with their label and value", () => {
    render(<PhaseDeliverableForm deliverable={deliverable()} mode="edit" />);
    const text = screen.getByLabelText("Briefing title");
    const area = screen.getByLabelText("Concept notes");
    const date = screen.getByLabelText("Delivery date");
    expect(text.tagName).toBe("INPUT");
    expect(text).toHaveValue("Sample dwelling");
    expect(area.tagName).toBe("TEXTAREA");
    expect(area).toHaveValue("Sample text");
    expect(date).toHaveAttribute("type", "date");
    expect(date).toHaveValue("2026-03-01");
  });

  it("the fields are editable", async () => {
    const user = userEvent.setup();
    render(<PhaseDeliverableForm deliverable={deliverable()} mode="edit" />);
    for (const e of LABELS) expect(blocked(screen.getByLabelText(e))).toBe(false);
    const text = screen.getByLabelText("Briefing title");
    await user.clear(text);
    await user.type(text, "New title");
    expect(text).toHaveValue("New title");
    const area = screen.getByLabelText("Concept notes");
    await user.type(area, " more");
    expect(area).toHaveValue("Sample text more");
    const date = screen.getByLabelText("Delivery date");
    fireEvent.change(date, { target: { value: "2026-04-15" } });
    expect(date).toHaveValue("2026-04-15");
  });

  it("the «Guardar» button calls onSave", async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();
    render(<PhaseDeliverableForm deliverable={deliverable()} mode="edit" onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("Guardar without onSave does not fail", async () => {
    const user = userEvent.setup();
    render(<PhaseDeliverableForm deliverable={deliverable()} mode="edit" />);
    await expect(user.click(screen.getByRole("button", { name: "Guardar" }))).resolves.not.toThrow();
  });

  it("does not show the frozen version", () => {
    render(<PhaseDeliverableForm deliverable={deliverable()} mode="edit" />);
    expect(screen.queryByText(/congelada/i)).not.toBeInTheDocument();
  });

  it("with an empty field list it does not fail and still offers Guardar", () => {
    render(<PhaseDeliverableForm deliverable={deliverable({ fields: [] })} mode="edit" />);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("no accessibility violations", async () => {
    const { container } = render(<PhaseDeliverableForm deliverable={deliverable()} mode="edit" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("PhaseDeliverableForm · read-only", () => {
  const props = { deliverable: deliverable({ frozenVersion: "v1" }), mode: "read-only" as const };

  it("all fields are readOnly or disabled and keep their value", () => {
    render(<PhaseDeliverableForm {...props} />);
    for (const e of LABELS) expect(blocked(screen.getByLabelText(e))).toBe(true);
    expect(screen.getByLabelText("Briefing title")).toHaveValue("Sample dwelling");
  });

  it("cannot type in the fields", async () => {
    const user = userEvent.setup();
    render(<PhaseDeliverableForm {...props} />);
    await user.type(screen.getByLabelText("Briefing title"), "xyz");
    await user.type(screen.getByLabelText("Concept notes"), "xyz");
    expect(screen.getByLabelText("Briefing title")).toHaveValue("Sample dwelling");
    expect(screen.getByLabelText("Concept notes")).toHaveValue("Sample text");
  });

  it("there is no «Guardar» button", () => {
    render(<PhaseDeliverableForm {...props} />);
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  });

  it("shows the frozen version", () => {
    render(<PhaseDeliverableForm {...props} />);
    expect(screen.getByText(/v1/)).toBeInTheDocument();
    expect(screen.getByText(/congelada/i)).toBeInTheDocument();
  });

  it("onSave is never called", async () => {
    const onSave = jest.fn();
    render(<PhaseDeliverableForm {...props} onSave={onSave} />);
    await userEvent.setup().keyboard("{Enter}");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("with an empty field list it does not fail", () => {
    render(<PhaseDeliverableForm deliverable={deliverable({ frozenVersion: "v1", fields: [] })} mode="read-only" />);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("no accessibility violations", async () => {
    const { container } = render(<PhaseDeliverableForm {...props} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("PhaseDeliverableForm · preview", () => {
  const props = { deliverable: deliverable(), mode: "preview" as const };

  it("all fields are disabled", () => {
    render(<PhaseDeliverableForm {...props} />);
    for (const e of LABELS) expect(screen.getByLabelText(e)).toBeDisabled();
  });

  it("there is no «Guardar» button", () => {
    render(<PhaseDeliverableForm {...props} />);
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  });

  it("cannot type", async () => {
    const user = userEvent.setup();
    render(<PhaseDeliverableForm {...props} />);
    await user.type(screen.getByLabelText("Briefing title"), "xyz");
    expect(screen.getByLabelText("Briefing title")).toHaveValue("Sample dwelling");
  });

  it("does not show the frozen version", () => {
    render(<PhaseDeliverableForm {...props} />);
    expect(screen.queryByText(/congelada/i)).not.toBeInTheDocument();
  });

  it("with an empty field list it does not fail", () => {
    render(<PhaseDeliverableForm deliverable={deliverable({ fields: [] })} mode="preview" />);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("no accessibility violations", async () => {
    const { container } = render(<PhaseDeliverableForm {...props} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("PhaseDeliverableForm · submitting the form never saves outside edit mode (Tester)", () => {
  it.each(["read-only", "preview"] as const)("%s: forced submit and Enter in a field do not call onSave", async (mode) => {
    const onSave = jest.fn();
    const { container } = render(<PhaseDeliverableForm deliverable={deliverable({ frozenVersion: "v1" })} mode={mode} onSave={onSave} />);
    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);
    screen.getByLabelText("Briefing title").focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /guardar/i })).toBeNull();
  });
});
