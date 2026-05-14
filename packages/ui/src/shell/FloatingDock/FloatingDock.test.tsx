import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { FloatingDock } from "./FloatingDock";

afterEach(cleanup);

const primary = { label: "Rigenera", hotkey: "⌘R", onClick: vi.fn() };

describe("FloatingDock", () => {
  it("renders page label", () => {
    const { getByText } = render(
      <FloatingDock label="BUDGET" primaryAction={primary} />
    );
    expect(getByText("BUDGET")).toBeTruthy();
  });

  it("renders primary action", () => {
    const { getByText } = render(
      <FloatingDock label="BUDGET" primaryAction={primary} />
    );
    expect(getByText("Rigenera")).toBeTruthy();
  });

  it("calls primaryAction.onClick on click", () => {
    const onClick = vi.fn();
    const { getByText } = render(
      <FloatingDock
        label="BUDGET"
        primaryAction={{ label: "Rigenera", onClick }}
      />
    );
    fireEvent.click(getByText("Rigenera"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders secondary actions", () => {
    const { getByText } = render(
      <FloatingDock
        label="BUDGET"
        primaryAction={primary}
        secondaryActions={[{ label: "Esporta", onClick: vi.fn() }]}
      />
    );
    expect(getByText("Esporta")).toBeTruthy();
  });

  it("shows cesare note count when > 0", () => {
    const { getByText } = render(
      <FloatingDock
        label="BUDGET"
        primaryAction={primary}
        cesareNoteCount={3}
      />
    );
    expect(getByText("3")).toBeTruthy();
  });

  it("calls onCesareClick when Cesare pill clicked", () => {
    const onCesareClick = vi.fn();
    const { getByRole } = render(
      <FloatingDock
        label="BUDGET"
        primaryAction={primary}
        onCesareClick={onCesareClick}
      />
    );
    fireEvent.click(getByRole("button", { name: /Cesare/i }));
    expect(onCesareClick).toHaveBeenCalledTimes(1);
  });

  it("has role=toolbar", () => {
    const { getByRole } = render(
      <FloatingDock label="BUDGET" primaryAction={primary} />
    );
    expect(getByRole("toolbar")).toBeTruthy();
  });
});
