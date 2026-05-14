import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { ToggleChip } from "./ToggleChip";

afterEach(cleanup);

describe("ToggleChip", () => {
  it("renders a button with role switch", () => {
    const { getByRole } = render(
      <ToggleChip isOn={false} onToggle={() => {}} label="Cast" />
    );
    expect(getByRole("switch")).toBeTruthy();
  });

  it("aria-checked matches isOn prop", () => {
    const { getByRole, rerender } = render(
      <ToggleChip isOn={false} onToggle={() => {}} label="Cast" />
    );
    expect(getByRole("switch").getAttribute("aria-checked")).toBe("false");

    rerender(<ToggleChip isOn={true} onToggle={() => {}} label="Cast" />);
    expect(getByRole("switch").getAttribute("aria-checked")).toBe("true");
  });

  it("calls onToggle on click", () => {
    const onToggle = vi.fn();
    const { getByRole } = render(
      <ToggleChip isOn={false} onToggle={onToggle} label="Cast" />
    );
    fireEvent.click(getByRole("switch"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows the label text", () => {
    const { getByText } = render(
      <ToggleChip isOn={true} onToggle={() => {}} label="Locations" />
    );
    expect(getByText("Locations")).toBeTruthy();
  });

  it("uses aria-label when provided", () => {
    const { getByRole } = render(
      <ToggleChip
        isOn={false}
        onToggle={() => {}}
        label="Cast"
        aria-label="Mostra sottolineature Cast"
      />
    );
    expect(getByRole("switch").getAttribute("aria-label")).toBe(
      "Mostra sottolineature Cast"
    );
  });
});
