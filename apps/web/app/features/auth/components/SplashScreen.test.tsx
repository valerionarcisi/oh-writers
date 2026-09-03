// @vitest-environment jsdom
// apps/web/app/features/auth/components/SplashScreen.test.ts
// Brand splash renders the cursor-wordmark lockup: `oh-` + typewriter
// `writers` letters. Reduced-motion hiding is pure CSS (media query), so the
// unit test only asserts the static structure + a11y label.

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { SplashScreen } from "./SplashScreen";

describe("SplashScreen", () => {
  it("renders the brand lockup with a11y label and typewriter letters", () => {
    const { getByTestId, getByRole, getByText } = render(<SplashScreen />);
    expect(getByTestId("app-splash")).toBeTruthy();
    expect(getByRole("img", { name: "Oh Writers" })).toBeTruthy();
    expect(getByText("oh-")).toBeTruthy();
    // Typewriter letters render individually so CSS can stagger them per-index.

    expect(getByText("w")).toBeTruthy();
    expect(getByText("s")).toBeTruthy();
  });
});
