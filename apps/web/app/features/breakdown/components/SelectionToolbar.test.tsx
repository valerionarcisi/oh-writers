// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { BREAKDOWN_CATEGORIES } from "@oh-writers/domain";
import { SelectionToolbar } from "./SelectionToolbar";

afterEach(cleanup);

describe("SelectionToolbar", () => {
  it("renders one button per breakdown category", () => {
    render(
      <SelectionToolbar
        x={0}
        y={0}
        selectedText="Filippo"
        onTag={() => {}}
        onDismiss={() => {}}
      />,
    );
    for (const cat of BREAKDOWN_CATEGORIES) {
      expect(screen.getByTestId(`selection-toolbar-${cat}`)).toBeTruthy();
    }
    expect(screen.getAllByRole("button").length).toBe(
      BREAKDOWN_CATEGORIES.length,
    );
  });

  it("calls onTag with category and selected text on button click", () => {
    const onTag = vi.fn();
    render(
      <SelectionToolbar
        x={0}
        y={0}
        selectedText="Filippo"
        onTag={onTag}
        onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("selection-toolbar-cast"));
    expect(onTag).toHaveBeenCalledWith("cast", "Filippo");
  });

  it("calls onDismiss when Escape is pressed", () => {
    const onDismiss = vi.fn();
    render(
      <SelectionToolbar
        x={0}
        y={0}
        selectedText="Filippo"
        onTag={() => {}}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
