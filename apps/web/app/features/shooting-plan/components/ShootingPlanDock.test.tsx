/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LocaleProvider } from "~/features/i18n";
import { ShootingPlanDock } from "./ShootingPlanDock";

function renderDock(onCesareClick?: () => void) {
  return render(
    <LocaleProvider locale="en">
      <ShootingPlanDock
        projectId="p1"
        suggestedShotCount={0}
        onCesareClick={onCesareClick}
      />
    </LocaleProvider>,
  );
}

describe("ShootingPlanDock", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("hides the Cesare button when onCesareClick is not provided (AI disabled)", () => {
    renderDock(undefined);
    expect(screen.queryByText("Cesare")).toBeNull();
  });

  it("shows the Cesare button when onCesareClick is provided (AI enabled)", () => {
    renderDock(() => {});
    expect(screen.getByText("Cesare")).toBeTruthy();
  });
});
