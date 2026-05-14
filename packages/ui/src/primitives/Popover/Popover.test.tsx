// packages/ui/src/primitives/Popover/Popover.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { Popover } from "./Popover";

afterEach(cleanup);

describe("Popover", () => {
  it("renders nothing when isOpen=false", () => {
    const { container } = render(
      <Popover isOpen={false} onClose={() => {}}>
        <p>Content</p>
      </Popover>
    );
    expect(container.querySelector("[role='dialog']")).toBeNull();
  });

  it("renders children when isOpen=true", () => {
    const { getByText } = render(
      <Popover isOpen={true} onClose={() => {}}>
        <p>Popover content</p>
      </Popover>
    );
    expect(getByText("Popover content")).toBeTruthy();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(
      <Popover isOpen={true} onClose={onClose}>
        <p>Content</p>
      </Popover>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose on other keys", () => {
    const onClose = vi.fn();
    render(
      <Popover isOpen={true} onClose={onClose}>
        <p>Content</p>
      </Popover>
    );
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("has role=dialog", () => {
    const { getByRole } = render(
      <Popover isOpen={true} onClose={() => {}}>
        <p>Content</p>
      </Popover>
    );
    expect(getByRole("dialog")).toBeTruthy();
  });
});
