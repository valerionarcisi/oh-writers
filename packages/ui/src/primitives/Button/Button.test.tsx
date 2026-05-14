// packages/ui/src/primitives/Button/Button.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { Button } from "./Button";

afterEach(cleanup);

describe("Button DS-v2", () => {
  it("renders children", () => {
    const { getByText } = render(<Button variant="primary">Salva</Button>);
    expect(getByText("Salva")).toBeTruthy();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <Button variant="ghost" onClick={onClick}>Click me</Button>
    );
    fireEvent.click(getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled when disabled prop is true", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <Button variant="primary" disabled onClick={onClick}>Save</Button>
    );
    const btn = getByRole("button");
    expect(btn).toHaveProperty("disabled", true);
  });

  it("renders hotkey badge when hotkey provided", () => {
    const { getByText } = render(
      <Button variant="ghost" hotkey="⌘S">Salva</Button>
    );
    expect(getByText("⌘S")).toBeTruthy();
  });

  it("renders as a native button element", () => {
    const { getByRole } = render(<Button variant="primary">Test</Button>);
    expect(getByRole("button").tagName).toBe("BUTTON");
  });
});
