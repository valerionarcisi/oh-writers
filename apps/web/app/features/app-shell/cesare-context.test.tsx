/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FeatureProvider } from "~/features/feature-flags";
import { CesareProvider, useCesareOpen } from "./cesare-context";

function Probe() {
  const open = useCesareOpen();
  return (
    <button type="button" onClick={() => open()}>
      open
    </button>
  );
}

describe("useCesareOpen", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("calls the provided openCesare when AI is enabled", () => {
    const openCesare = vi.fn();
    render(
      <FeatureProvider locale="en" isDevEnvironment={false} isAiEnabled={true}>
        <CesareProvider openCesare={openCesare}>
          <Probe />
        </CesareProvider>
      </FeatureProvider>,
    );
    screen.getByRole("button").click();
    expect(openCesare).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when AI is disabled, even if a real openCesare is provided", () => {
    const openCesare = vi.fn();
    render(
      <FeatureProvider locale="en" isDevEnvironment={false} isAiEnabled={false}>
        <CesareProvider openCesare={openCesare}>
          <Probe />
        </CesareProvider>
      </FeatureProvider>,
    );
    screen.getByRole("button").click();
    expect(openCesare).not.toHaveBeenCalled();
  });

  it("still calls openCesare outside a FeatureProvider (Storybook/isolated tests)", () => {
    const openCesare = vi.fn();
    render(
      <CesareProvider openCesare={openCesare}>
        <Probe />
      </CesareProvider>,
    );
    screen.getByRole("button").click();
    expect(openCesare).toHaveBeenCalledTimes(1);
  });
});
