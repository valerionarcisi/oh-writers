import { useRef, useState } from "react";
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { Modal } from "./Modal";

// jsdom doesn't implement the native <dialog> modal API; stub showModal/close
// so the component can drive the [open] state the CSS relies on.
beforeAll(() => {
  Object.defineProperty(window.HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(window.HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.removeAttribute("open");
    },
  });
});

// FocusScope restores focus inside a requestAnimationFrame on unmount.
const flushRaf = () =>
  act(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );

afterEach(cleanup);

// The native <dialog> and react-aria's useDialog div both expose role="dialog".
// The inner content div is the one carrying the ARIA wiring; select it.
const ariaDialog = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[role='dialog']")).find(
    (el) => el.tagName !== "DIALOG",
  )!;

describe("Modal", () => {
  it("renders title, description, children and footer when open", () => {
    const { getByText } = render(
      <Modal
        isOpen
        onClose={() => {}}
        title="Esporta PDF"
        description="Scegli il formato"
        footer={<button type="button">Conferma</button>}
      >
        <p>Body content</p>
      </Modal>,
    );
    expect(getByText("Esporta PDF")).toBeTruthy();
    expect(getByText("Scegli il formato")).toBeTruthy();
    expect(getByText("Body content")).toBeTruthy();
    expect(getByText("Conferma")).toBeTruthy();
  });

  it("wires aria-labelledby and aria-describedby to title/description", () => {
    render(
      <Modal isOpen onClose={() => {}} title="Titolo" description="Desc">
        <p>Body</p>
      </Modal>,
    );
    const dialog = ariaDialog();
    const labelId = dialog.getAttribute("aria-labelledby");
    const descId = dialog.getAttribute("aria-describedby");
    expect(document.getElementById(labelId!)?.textContent).toBe("Titolo");
    expect(document.getElementById(descId!)?.textContent).toBe("Desc");
  });

  it("omits aria-describedby when no description is given", () => {
    render(
      <Modal isOpen onClose={() => {}} title="Solo titolo">
        <p>Body</p>
      </Modal>,
    );
    expect(ariaDialog().getAttribute("aria-describedby")).toBeNull();
  });

  it("applies data-size", () => {
    const { container } = render(
      <Modal isOpen onClose={() => {}} title="T" size="lg">
        <p>Body</p>
      </Modal>,
    );
    expect(container.querySelector("dialog")?.getAttribute("data-size")).toBe(
      "lg",
    );
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="T">
        <p>Body</p>
      </Modal>,
    );
    fireEvent.keyDown(ariaDialog(), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on backdrop (dialog element) click", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal isOpen onClose={onClose} title="T">
        <p>Body</p>
      </Modal>,
    );
    const dialog = container.querySelector("dialog")!;
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not close when clicking content inside", () => {
    const onClose = vi.fn();
    const { getByText } = render(
      <Modal isOpen onClose={onClose} title="T">
        <p>Inside</p>
      </Modal>,
    );
    fireEvent.mouseDown(getByText("Inside"));
    fireEvent.mouseUp(getByText("Inside"));
    fireEvent.click(getByText("Inside"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("honours initialFocusRef on open", () => {
    function Harness() {
      const focusRef = useRef<HTMLButtonElement>(null);
      return (
        <Modal isOpen onClose={() => {}} title="T" initialFocusRef={focusRef}>
          <button type="button">first</button>
          <button type="button" ref={focusRef} data-testid="target">
            target
          </button>
        </Modal>
      );
    }
    const { getByTestId } = render(<Harness />);
    expect(document.activeElement).toBe(getByTestId("target"));
  });

  it("restores focus to the opener when closed", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button
            type="button"
            data-testid="opener"
            onClick={() => setOpen(true)}
          >
            open
          </button>
          {open ? (
            <Modal isOpen onClose={() => setOpen(false)} title="T">
              <button type="button" data-testid="inside">
                inside
              </button>
            </Modal>
          ) : null}
        </div>
      );
    }
    const { getByTestId, queryByRole } = render(<Harness />);
    const opener = getByTestId("opener");
    opener.focus();
    expect(document.activeElement).toBe(opener);
    fireEvent.click(opener);
    fireEvent.keyDown(getByTestId("inside"), { key: "Escape" });
    expect(queryByRole("dialog")).toBeNull();
    await flushRaf();
    expect(document.activeElement).toBe(opener);
  });
});
