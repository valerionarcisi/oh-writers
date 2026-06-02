import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { BaseButton } from "./BaseButton";

const styles = {
  button: "btn",
  primary: "v-primary",
  secondary: "v-secondary",
  danger: "v-danger",
  ghost: "v-ghost",
  sm: "s-sm",
  lg: "s-lg",
  hotkey: "hk",
};

afterEach(cleanup);

describe("BaseButton", () => {
  it("maps variant to the matching style class", () => {
    const { getByRole } = render(
      <BaseButton styles={styles} variant="danger">
        Elimina
      </BaseButton>,
    );
    const btn = getByRole("button");
    expect(btn.className).toContain("btn");
    expect(btn.className).toContain("v-danger");
  });

  it("omits a size class for md and applies one for sm/lg", () => {
    const { getByRole, rerender } = render(
      <BaseButton styles={styles} size="md">
        x
      </BaseButton>,
    );
    expect(getByRole("button").className).not.toContain("s-sm");
    expect(getByRole("button").className).not.toContain("s-lg");

    rerender(
      <BaseButton styles={styles} size="lg">
        x
      </BaseButton>,
    );
    expect(getByRole("button").className).toContain("s-lg");
  });

  it("renders an aria-hidden hotkey badge when hotkey is provided", () => {
    const { getByText } = render(
      <BaseButton styles={styles} hotkey="⌘S">
        Salva
      </BaseButton>,
    );
    const badge = getByText("⌘S");
    expect(badge.className).toContain("hk");
    expect(badge.getAttribute("aria-hidden")).toBe("true");
  });

  it("fires onPress and onClick", () => {
    const onPress = vi.fn();
    const onClick = vi.fn();
    const { getByRole } = render(
      <BaseButton styles={styles} onPress={onPress} onClick={onClick}>
        Click
      </BaseButton>,
    );
    fireEvent.click(getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire press handlers when disabled", () => {
    const onPress = vi.fn();
    const { getByRole } = render(
      <BaseButton styles={styles} disabled onPress={onPress}>
        x
      </BaseButton>,
    );
    fireEvent.click(getByRole("button"));
    expect(onPress).not.toHaveBeenCalled();
    expect(getByRole("button")).toHaveProperty("disabled", true);
  });

  it("forwards aria attributes through useButton", () => {
    const { getByRole } = render(
      <BaseButton styles={styles} aria-haspopup="menu" aria-expanded={true}>
        Menu
      </BaseButton>,
    );
    const btn = getByRole("button");
    expect(btn.getAttribute("aria-haspopup")).toBe("menu");
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });
});
