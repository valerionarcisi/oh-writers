import { describe, it, expect } from "vitest";
import {
  DRAFT_REVISION_COLORS,
  FIRST_DRAFT_COLOR,
  suggestNextColor,
} from "./revision-color.js";

describe("suggestNextColor", () => {
  it("returns white when no versions exist", () => {
    expect(suggestNextColor([])).toBe("white");
  });

  it("returns blue right after a single white version", () => {
    expect(suggestNextColor(["white"])).toBe("blue");
  });

  it("walks the canonical cycle blue → pink → yellow → green …", () => {
    expect(suggestNextColor(["white", "blue"])).toBe("pink");
    expect(suggestNextColor(["white", "blue", "pink"])).toBe("yellow");
    expect(suggestNextColor(["white", "blue", "pink", "yellow"])).toBe("green");
  });

  it("wraps from tan back to blue, never to white", () => {
    expect(suggestNextColor(["tan"])).toBe("blue");
  });

  it("only looks at the most recent color", () => {
    expect(suggestNextColor(["pink", "yellow", "green", "salmon"])).toBe(
      "cherry",
    );
  });

  it("treats null / unknown entries as a white baseline", () => {
    expect(suggestNextColor([null])).toBe("blue");
    expect(suggestNextColor(["white", null])).toBe("blue");
  });

  it("the canonical cycle is exactly the 10 known colors", () => {
    expect(DRAFT_REVISION_COLORS).toHaveLength(10);
    expect(DRAFT_REVISION_COLORS[0]).toBe(FIRST_DRAFT_COLOR);
  });
});
