import { describe, it, expect } from "vitest";
import { findGlobalCssHref } from "./resolve-global-css-href.server";

describe("findGlobalCssHref", () => {
  it("returns the entry chunk's own css when present", () => {
    const href = findGlobalCssHref({
      "virtual:entry": { isEntry: true, css: ["assets/entry-abc.css"] },
    });
    expect(href).toBe("/_build/assets/entry-abc.css");
  });

  it("falls back to an imported chunk's css when the entry has none", () => {
    const href = findGlobalCssHref({
      "virtual:entry": { isEntry: true, imports: ["_core.js"] },
      "_core.js": { css: ["assets/core-xyz.css"] },
    });
    expect(href).toBe("/_build/assets/core-xyz.css");
  });

  it("returns undefined when no entry chunk exists", () => {
    const href = findGlobalCssHref({
      "some-chunk.js": { css: ["assets/unused.css"] },
    });
    expect(href).toBeUndefined();
  });

  it("returns undefined when neither the entry nor its imports carry css", () => {
    const href = findGlobalCssHref({
      "virtual:entry": { isEntry: true, imports: ["_core.js"] },
      "_core.js": {},
    });
    expect(href).toBeUndefined();
  });
});
