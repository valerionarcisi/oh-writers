// @vitest-environment jsdom
// apps/web/app/features/auth/components/SplashScreen.test.ts
// Brand splash renders the cursor-wordmark lockup: `oh-` + typewriter
// `writers` letters. Reduced-motion hiding is pure CSS (media query), so the
// unit test only asserts the static structure + a11y label.

import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { LocaleProvider } from "~/features/i18n";
import { SplashScreen } from "./SplashScreen";

describe("SplashScreen", () => {
  it("renders the brand lockup with a11y label and typewriter letters", () => {
    const { getByTestId, getByRole, getByText } = render(
      <LocaleProvider locale="it">
        <SplashScreen />
      </LocaleProvider>,
    );
    expect(getByTestId("app-splash")).toBeTruthy();
    expect(getByRole("img", { name: "Oh Writers" })).toBeTruthy();
    expect(getByText("oh-")).toBeTruthy();
    // Typewriter letters render individually so CSS can stagger them per-index.

    expect(getByText("w")).toBeTruthy();
    expect(getByText("s")).toBeTruthy();
  });

  it("renders quote 0 by default — the value SSR and the first client render must agree on before the post-mount random pick, so no hydration mismatch", () => {
    // Math.random forced to 0 still selects index 0 (Math.floor(0 * n) === 0),
    // so this pins that the pre-effect render and the post-effect render are
    // consistent for the deterministic case, not just "some quote shows".
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { getByText } = render(
      <LocaleProvider locale="en">
        <SplashScreen />
      </LocaleProvider>,
    );
    expect(
      getByText(
        "If you have a problem with the third act, the real problem is in the first act.",
        { exact: false },
      ),
    ).toBeTruthy();
    expect(getByText("Billy Wilder", { exact: false })).toBeTruthy();
    vi.restoreAllMocks();
  });
});
