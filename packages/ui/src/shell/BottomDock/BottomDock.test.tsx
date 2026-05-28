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
});
