// packages/ui/src/primitives/Tooltip/Tooltip.test.tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { Tooltip } from "./Tooltip";

afterEach(cleanup);

// react-aria opens on focus only when focus is keyboard-driven (focus-visible);
// fire a keydown first so the global interaction modality is "keyboard". Use the
// element's native .focus() (which jsdom turns into focus + focusin) — React's
// onFocus delegation listens on focusin, so a bare fireEvent.focus would no-op.
const keyboardFocus = (el: HTMLElement) => {
  fireEvent.keyDown(document.body, { key: "Tab" });
  act(() => {
    el.focus();
  });
};

const blur = (el: HTMLElement) => {
  act(() => {
    el.blur();
  });
};

describe("Tooltip", () => {
  it("is not in the DOM when closed", () => {
    const { queryByRole } = render(
      <Tooltip content="Hint">
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    expect(queryByRole("tooltip")).toBeNull();
  });

  it("shows on keyboard focus and hides on blur", () => {
    const { getByRole, queryByRole } = render(
      <Tooltip content="Hint">
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    const trigger = getByRole("button");

    // Keyboard focus opens immediately (no warmup delay on focus).
    keyboardFocus(trigger);
    const tip = getByRole("tooltip");
    expect(tip).toBeTruthy();
    expect(tip.textContent).toBe("Hint");

    blur(trigger);
    expect(queryByRole("tooltip")).toBeNull();
  });

  it("shows on hover (honoring react-aria warmup) and hides on unhover", () => {
    vi.useFakeTimers();
    try {
      const { getByRole, queryByRole } = render(
        <Tooltip content="Hint">
          <button type="button">Trigger</button>
        </Tooltip>,
      );
      const trigger = getByRole("button");

      // Pointer modality + hover. react-aria applies a global warmup delay
      // before the first hover-tooltip in a group opens; flush it.
      fireEvent.mouseMove(trigger);
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(getByRole("tooltip")).toBeTruthy();

      fireEvent.mouseLeave(trigger);
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(queryByRole("tooltip")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("applies kind and placement classes when open", () => {
    const { getByRole } = render(
      <Tooltip content="Hint" kind="info" placement="bottom">
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    keyboardFocus(getByRole("button"));
    const tip = getByRole("tooltip");
    expect(tip.className).toContain("info");
    expect(tip.className).toContain("bottom");
  });

  it("renders arbitrary non-button children as the trigger", () => {
    const { getByText, getByRole } = render(
      <Tooltip content="Hint">
        <span tabIndex={0}>icon</span>
      </Tooltip>,
    );
    keyboardFocus(getByText("icon"));
    expect(getByRole("tooltip").textContent).toBe("Hint");
  });
});
