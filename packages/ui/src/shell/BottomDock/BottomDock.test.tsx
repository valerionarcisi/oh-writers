// packages/ui/src/shell/BottomDock/BottomDock.test.tsx
//
// [OHW-047-A3] The dock is a single Cesare launcher pill. Bell / avatar / gear
// moved to the LeftRail footer (Spec 47b FIX 1) and must NOT render here.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { BottomDock } from "./BottomDock";

afterEach(cleanup);

describe("BottomDock", () => {
  it("renders only the Cesare launcher pill", () => {
    const { getByLabelText, queryByLabelText } = render(
      <BottomDock onCesareToggle={vi.fn()} />,
    );
    expect(getByLabelText(/Apri Cesare/)).toBeTruthy();
    // Account actions live in the rail footer now — not the dock.
    expect(queryByLabelText(/Notifiche/)).toBeNull();
    expect(queryByLabelText(/Impostazioni/)).toBeNull();
    expect(queryByLabelText(/Account/)).toBeNull();
  });

  it("calls onCesareToggle when the Cesare pill is clicked", () => {
    const onCesareToggle = vi.fn();
    const { getByLabelText } = render(
      <BottomDock onCesareToggle={onCesareToggle} />,
    );
    fireEvent.click(getByLabelText(/Apri Cesare/));
    expect(onCesareToggle).toHaveBeenCalledTimes(1);
  });

  it("exposes the toolbar role for assistive tech", () => {
    const { getByRole } = render(<BottomDock onCesareToggle={vi.fn()} />);
    expect(getByRole("toolbar")).toBeTruthy();
  });

  it("shows the Cesare label by default", () => {
    const { getByText } = render(<BottomDock onCesareToggle={vi.fn()} />);
    expect(getByText("Cesare")).toBeTruthy();
  });

  it("hides the Cesare label when showCesareLabel=false", () => {
    const { queryByText } = render(
      <BottomDock onCesareToggle={vi.fn()} showCesareLabel={false} />,
    );
    expect(queryByText("Cesare")).toBeNull();
  });
});
