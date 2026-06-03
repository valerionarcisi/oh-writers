// packages/ui/src/primitives/Popover/Popover.test.tsx
import { useRef, useState, type ReactNode } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { Popover } from "./Popover";

// react-aria's FocusScope restores focus inside a requestAnimationFrame on
// unmount; flush it so the assertion sees the restored focus.
const flushRaf = () =>
  act(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );

afterEach(cleanup);

// All tests mount a real trigger so the popover can anchor to it. The popover
// portals to document.body and positions via getBoundingClientRect (all zeros
// in jsdom, which is fine — it just resolves to the top-left default).
function Harness({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button type="button" ref={triggerRef} data-testid="anchor">
        anchor
      </button>
      <Popover isOpen={isOpen} onClose={onClose} triggerRef={triggerRef}>
        {children}
      </Popover>
    </div>
  );
}

describe("Popover", () => {
  it("renders nothing when isOpen=false", () => {
    render(
      <Harness isOpen={false} onClose={() => {}}>
        <p>Content</p>
      </Harness>,
    );
    expect(document.querySelector("[role='dialog']")).toBeNull();
  });

  it("renders children when isOpen=true", () => {
    const { getByText } = render(
      <Harness isOpen={true} onClose={() => {}}>
        <p>Popover content</p>
      </Harness>,
    );
    expect(getByText("Popover content")).toBeTruthy();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      <Harness isOpen={true} onClose={onClose}>
        <p>Content</p>
      </Harness>,
    );
    // react-aria's useOverlay binds the Esc handler to the overlay element,
    // not the document.
    fireEvent.keyDown(getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose on other keys", () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      <Harness isOpen={true} onClose={onClose}>
        <p>Content</p>
      </Harness>,
    );
    fireEvent.keyDown(getByRole("dialog"), { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose on outside click", () => {
    const onClose = vi.fn();
    render(
      <Harness isOpen={true} onClose={onClose}>
        <p>Content</p>
      </Harness>,
    );
    // In jsdom (no PointerEvent), react-aria's useInteractOutside listens on
    // mousedown + mouseup; both outside the overlay fire the dismissal.
    fireEvent.mouseDown(document.body);
    fireEvent.mouseUp(document.body);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not call onClose when clicking inside", () => {
    const onClose = vi.fn();
    const { getByText } = render(
      <Harness isOpen={true} onClose={onClose}>
        <p>Inside content</p>
      </Harness>,
    );
    fireEvent.mouseDown(getByText("Inside content"));
    fireEvent.mouseUp(getByText("Inside content"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("has role=dialog", () => {
    const { getByRole } = render(
      <Harness isOpen={true} onClose={() => {}}>
        <p>Content</p>
      </Harness>,
    );
    expect(getByRole("dialog")).toBeTruthy();
  });

  it("restores focus to the trigger when it closes", async () => {
    function FocusHarness() {
      const [open, setOpen] = useState(false);
      const triggerRef = useRef<HTMLButtonElement>(null);
      return (
        <div>
          <button
            type="button"
            ref={triggerRef}
            data-testid="trigger"
            onClick={() => setOpen(true)}
          >
            trigger
          </button>
          {open ? (
            <Popover
              isOpen={true}
              onClose={() => setOpen(false)}
              triggerRef={triggerRef}
            >
              <button type="button" data-testid="inside-btn">
                inside
              </button>
            </Popover>
          ) : null}
        </div>
      );
    }
    const { getByTestId, queryByRole } = render(<FocusHarness />);
    const trigger = getByTestId("trigger");
    // Focus the trigger, then open the popover: FocusScope captures the
    // focused node at mount time so restoreFocus can return to it on close.
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);

    const inside = getByTestId("inside-btn");
    inside.focus();
    expect(document.activeElement).toBe(inside);

    // Close via Esc; FocusScope restoreFocus returns focus to the trigger.
    fireEvent.keyDown(getByTestId("inside-btn"), { key: "Escape" });
    expect(queryByRole("dialog")).toBeNull();
    await flushRaf();
    expect(document.activeElement).toBe(trigger);
  });
});
