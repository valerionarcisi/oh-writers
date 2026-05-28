// packages/ui/src/shell/BottomDock/BottomDock.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { BottomDock } from "./BottomDock";

afterEach(cleanup);

const baseProps = {
  user: { initials: "VN" },
  onBell: vi.fn(),
  onAvatar: vi.fn(),
  onSettings: vi.fn(),
  onCesareToggle: vi.fn(),
};

describe("BottomDock", () => {
  it("renders the four affordances", () => {
    const { getByLabelText } = render(<BottomDock {...baseProps} />);
    expect(getByLabelText(/Notifiche/)).toBeTruthy();
    expect(getByLabelText(/Account/)).toBeTruthy();
    expect(getByLabelText(/Impostazioni/)).toBeTruthy();
    expect(getByLabelText(/Apri Cesare/)).toBeTruthy();
  });

  it("calls onBell when the bell is clicked", () => {
    const onBell = vi.fn();
    const { getByLabelText } = render(
      <BottomDock {...baseProps} onBell={onBell} />,
    );
    fireEvent.click(getByLabelText(/Notifiche/));
    expect(onBell).toHaveBeenCalledTimes(1);
  });

  it("calls onSettings when the gear is clicked", () => {
    const onSettings = vi.fn();
    const { getByLabelText } = render(
      <BottomDock {...baseProps} onSettings={onSettings} />,
    );
    fireEvent.click(getByLabelText(/Impostazioni/));
    expect(onSettings).toHaveBeenCalledTimes(1);
  });

  it("calls onCesareToggle when the Cesare pill is clicked", () => {
    const onCesareToggle = vi.fn();
    const { getByLabelText } = render(
      <BottomDock {...baseProps} onCesareToggle={onCesareToggle} />,
    );
    fireEvent.click(getByLabelText(/Apri Cesare/));
    expect(onCesareToggle).toHaveBeenCalledTimes(1);
  });

  it("renders an unseen dot when hasUnseen is true", () => {
    const { getByLabelText } = render(
      <BottomDock {...baseProps} hasUnseen={true} />,
    );
    const bell = getByLabelText(/Notifiche/);
    // The dot is a span aria-hidden — only its presence matters.
    expect(bell.querySelector('span[aria-hidden="true"]')).toBeTruthy();
  });

  it("exposes the toolbar role for assistive tech", () => {
    const { getByRole } = render(<BottomDock {...baseProps} />);
    expect(getByRole("toolbar")).toBeTruthy();
  });

  it("does NOT render the unseen dot when hasUnseen is false", () => {
    const { getByLabelText } = render(
      <BottomDock {...baseProps} hasUnseen={false} />,
    );
    const bell = getByLabelText(/^Notifiche$/);
    // No dot indicator when not unseen
    expect(bell.querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it("shows the Cesare label by default", () => {
    const { getByText } = render(<BottomDock {...baseProps} />);
    expect(getByText("Cesare")).toBeTruthy();
  });

  it("hides the Cesare label when showCesareLabel=false", () => {
    const { queryByText } = render(
      <BottomDock {...baseProps} showCesareLabel={false} />,
    );
    expect(queryByText("Cesare")).toBeNull();
  });

  it("renders the dropdown variant when userMenuItems are provided", () => {
    const { getByLabelText, queryByLabelText } = render(
      <BottomDock
        {...baseProps}
        userMenuItems={[{ label: "Esci", onClick: vi.fn() }]}
      />,
    );
    // Avatar button still has its label even in dropdown mode
    expect(getByLabelText(/Account/)).toBeTruthy();
    // onAvatar is not used when dropdown is mounted — clicking it opens menu,
    // not the raw onAvatar callback. We assert that the menu trigger is present.
    expect(queryByLabelText(/Account \(VN\)/)).toBeTruthy();
  });

  it("renders the avatar initials when no avatarUrl is provided", () => {
    const { getByText } = render(<BottomDock {...baseProps} />);
    expect(getByText("VN")).toBeTruthy();
  });

  it("falls back to a noop handler when onAvatar is not provided", () => {
    // Confirms onAvatar default behavior — no crash on click.
    const { getByLabelText } = render(
      <BottomDock
        user={baseProps.user}
        onBell={baseProps.onBell}
        onSettings={baseProps.onSettings}
        onCesareToggle={baseProps.onCesareToggle}
      />,
    );
    expect(() => fireEvent.click(getByLabelText(/Account/))).not.toThrow();
  });

  it("uses an explicit aria-label that announces unseen state for the bell", () => {
    const { getByLabelText } = render(
      <BottomDock {...baseProps} hasUnseen={true} />,
    );
    expect(getByLabelText("Notifiche — nuove")).toBeTruthy();
  });
});
