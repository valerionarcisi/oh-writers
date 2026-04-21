// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { GhostPopover } from "./GhostPopover";

afterEach(cleanup);

describe("GhostPopover", () => {
  it("renders Accept and Ignore buttons", () => {
    render(
      <GhostPopover
        x={0}
        y={0}
        onAccept={() => {}}
        onIgnore={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByTestId("ghost-popover")).toBeTruthy();
    expect(screen.getByTestId("ghost-popover-accept")).toBeTruthy();
    expect(screen.getByTestId("ghost-popover-ignore")).toBeTruthy();
  });

  it("calls onAccept when Accept is clicked", () => {
    const onAccept = vi.fn();
    render(
      <GhostPopover
        x={0}
        y={0}
        onAccept={onAccept}
        onIgnore={() => {}}
        onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("ghost-popover-accept"));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("calls onIgnore when Ignore is clicked", () => {
    const onIgnore = vi.fn();
    render(
      <GhostPopover
        x={0}
        y={0}
        onAccept={() => {}}
        onIgnore={onIgnore}
        onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("ghost-popover-ignore"));
    expect(onIgnore).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss when Escape is pressed", () => {
    const onDismiss = vi.fn();
    render(
      <GhostPopover
        x={0}
        y={0}
        onAccept={() => {}}
        onIgnore={() => {}}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("positions itself with x/y as fixed coordinates", () => {
    render(
      <GhostPopover
        x={123}
        y={456}
        onAccept={() => {}}
        onIgnore={() => {}}
        onDismiss={() => {}}
      />,
    );
    const el = screen.getByTestId("ghost-popover") as HTMLElement;
    expect(el.style.left).toBe("123px");
    expect(el.style.top).toBe("456px");
  });
});
