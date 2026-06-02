// packages/ui/src/shell/LeftRail/RailHamburger.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { RailHamburger } from "./RailHamburger";

afterEach(cleanup);

describe("RailHamburger", () => {
  it("renders a button with the open-state label by default", () => {
    const { getByTestId } = render(
      <RailHamburger onPress={vi.fn()} isOverlayOpen={false} />,
    );
    const btn = getByTestId("rail-hamburger");
    expect(btn.getAttribute("aria-label")).toBe("Apri sidebar");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("switches the label + aria-expanded when overlay is open", () => {
    const { getByTestId } = render(
      <RailHamburger onPress={vi.fn()} isOverlayOpen={true} />,
    );
    const btn = getByTestId("rail-hamburger");
    expect(btn.getAttribute("aria-label")).toBe("Fissa sidebar (⌘\\)");
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });

  it("fires onPress when clicked", () => {
    const onPress = vi.fn();
    const { getByTestId } = render(
      <RailHamburger onPress={onPress} isOverlayOpen={false} />,
    );
    fireEvent.click(getByTestId("rail-hamburger"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("honours an aria-label override", () => {
    const { getByLabelText } = render(
      <RailHamburger
        onPress={vi.fn()}
        isOverlayOpen={false}
        ariaLabel="Menu"
      />,
    );
    expect(getByLabelText("Menu")).toBeTruthy();
  });
});
