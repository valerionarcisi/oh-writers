import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { Drawer } from "./Drawer";

afterEach(cleanup);

// Mock showModal/close since jsdom doesn't implement them
Object.defineProperty(window.HTMLDialogElement.prototype, "showModal", {
  value: vi.fn(),
  writable: true,
});
Object.defineProperty(window.HTMLDialogElement.prototype, "close", {
  value: vi.fn(),
  writable: true,
});

describe("Drawer", () => {
  it("renders title and children when open", () => {
    const { getByText } = render(
      <Drawer isOpen={true} onClose={() => {}} title="Il Manifesto">
        <p>Drawer body</p>
      </Drawer>
    );
    expect(getByText("Il Manifesto")).toBeTruthy();
    expect(getByText("Drawer body")).toBeTruthy();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(
      <Drawer isOpen={true} onClose={onClose} title="Test">
        <p>Content</p>
      </Drawer>
    );
    fireEvent.click(getByLabelText("Chiudi"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("dialog has aria-labelledby pointing to title", () => {
    const { getByRole, getByText } = render(
      <Drawer isOpen={true} onClose={() => {}} title="Manifesto">
        <p>Body</p>
      </Drawer>
    );
    const dialog = getByRole("dialog", { hidden: true });
    const titleId = dialog.getAttribute("aria-labelledby");
    expect(titleId).toBeTruthy();
    const titleEl = document.getElementById(titleId!);
    expect(titleEl?.textContent).toBe("Manifesto");
  });

  it("renders dialog element in the DOM regardless of isOpen", () => {
    const { container } = render(
      <Drawer isOpen={false} onClose={() => {}} title="Test">
        <p>Content</p>
      </Drawer>
    );
    expect(container.querySelector("dialog")).toBeTruthy();
  });

  it("close button has aria-label Chiudi", () => {
    const { getByLabelText } = render(
      <Drawer isOpen={true} onClose={() => {}} title="Test">
        <p>Body</p>
      </Drawer>
    );
    expect(getByLabelText("Chiudi")).toBeTruthy();
  });
});
