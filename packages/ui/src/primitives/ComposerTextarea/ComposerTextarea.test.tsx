// packages/ui/src/primitives/ComposerTextarea/ComposerTextarea.test.tsx
// BUG-N65 — the shared auto-growing composer input. Pins the keyboard
// contract (Enter sends, Shift+Enter newline, Cmd/Ctrl+Enter sends) and the
// sizing wiring (the auto-grow effect drives an explicit block-size that
// tracks content; the cap itself is CSS and is asserted in the E2E).
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { ComposerTextarea } from "./ComposerTextarea";

afterEach(cleanup);

const renderComposer = (
  overrides: Partial<Parameters<typeof ComposerTextarea>[0]> = {},
) => {
  const onChange = vi.fn();
  const onSubmit = vi.fn();
  const utils = render(
    <ComposerTextarea
      value="ciao"
      onChange={onChange}
      onSubmit={onSubmit}
      ariaLabel="Composer Cesare"
      testId="composer-input"
      {...overrides}
    />,
  );
  const input = utils.getByTestId("composer-input") as HTMLTextAreaElement;
  return { ...utils, input, onChange, onSubmit };
};

describe("ComposerTextarea", () => {
  it("renders a one-row textarea with the accessible label", () => {
    const { input } = renderComposer();
    expect(input.tagName).toBe("TEXTAREA");
    expect(input.rows).toBe(1);
    expect(input.getAttribute("aria-label")).toBe("Composer Cesare");
  });

  it("submits on plain Enter", () => {
    const { input, onSubmit } = renderComposer();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does NOT submit on Shift+Enter (newline stays default)", () => {
    const { input, onSubmit } = renderComposer();
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits on Cmd+Enter and Ctrl+Enter (muscle memory)", () => {
    const { input, onSubmit } = renderComposer();
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("propagates typed input through onChange", () => {
    const { input, onChange } = renderComposer();
    fireEvent.change(input, { target: { value: "ciao Cesare" } });
    expect(onChange).toHaveBeenCalledWith("ciao Cesare");
  });

  it("is disabled while thinking and never submits", () => {
    const { input, onSubmit } = renderComposer({ isDisabled: true });
    expect(input.disabled).toBe(true);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("sets an explicit block-size from its content (auto-grow wiring)", () => {
    const { input, rerender, onChange, onSubmit } = renderComposer();
    // jsdom has no layout (scrollHeight = 0); the effect must still have run
    // and pinned an explicit block-size so real browsers track content height.
    expect(input.style.blockSize).not.toBe("");
    const before = input.style.blockSize;
    Object.defineProperty(input, "scrollHeight", {
      configurable: true,
      value: 120,
    });
    rerender(
      <ComposerTextarea
        value={"riga 1\nriga 2\nriga 3"}
        onChange={onChange}
        onSubmit={onSubmit}
        ariaLabel="Composer Cesare"
        testId="composer-input"
      />,
    );
    expect(input.style.blockSize).toBe("120px");
    expect(input.style.blockSize).not.toBe(before);
  });
});
