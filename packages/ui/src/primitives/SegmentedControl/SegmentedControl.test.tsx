import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { SegmentedControl } from "./SegmentedControl";
import styles from "./SegmentedControl.module.css";

afterEach(cleanup);

const options = [
  { id: "per-scene", label: "Per scena" },
  { id: "per-project", label: "Per progetto" },
  { id: "matrice", label: "Matrice" },
] as const;

describe("SegmentedControl", () => {
  it("renders a radio group with one radio per option", () => {
    const { getByRole, getAllByRole } = render(
      <SegmentedControl
        options={options}
        activeId="per-scene"
        onSelect={() => {}}
        ariaLabel="Vista"
      />,
    );
    expect(getByRole("radiogroup")).toBeTruthy();
    expect(getAllByRole("radio")).toHaveLength(3);
  });

  it("keeps the segmented-<id> testids", () => {
    const { getByTestId } = render(
      <SegmentedControl
        options={options}
        activeId="per-scene"
        onSelect={() => {}}
      />,
    );
    expect(getByTestId("segmented-per-scene")).toBeTruthy();
    expect(getByTestId("segmented-per-project")).toBeTruthy();
    expect(getByTestId("segmented-matrice")).toBeTruthy();
  });

  it("checks the active option and applies optionActive styling", () => {
    const { getByTestId } = render(
      <SegmentedControl
        options={options}
        activeId="per-project"
        onSelect={() => {}}
      />,
    );
    const active = getByTestId("segmented-per-project") as HTMLInputElement;
    const inactive = getByTestId("segmented-per-scene") as HTMLInputElement;
    expect(active.checked).toBe(true);
    expect(inactive.checked).toBe(false);
    expect(active.closest("label")?.className).toContain(styles.optionActive);
    expect(inactive.closest("label")?.className).not.toContain(
      styles.optionActive,
    );
  });

  it("calls onSelect with the option id on click", () => {
    const onSelect = vi.fn();
    const { getByTestId } = render(
      <SegmentedControl
        options={options}
        activeId="per-scene"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(getByTestId("segmented-matrice"));
    expect(onSelect).toHaveBeenCalledWith("matrice");
  });

  it("moves selection with arrow keys (roving focus + radio nav)", () => {
    const onSelect = vi.fn();
    const { getByTestId } = render(
      <SegmentedControl
        options={options}
        activeId="per-scene"
        onSelect={onSelect}
      />,
    );
    const first = getByTestId("segmented-per-scene");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenCalledWith("per-project");
  });
});
