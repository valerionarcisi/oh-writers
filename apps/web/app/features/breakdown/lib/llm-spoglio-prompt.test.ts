import { describe, it, expect } from "vitest";
import { statusForConfidence } from "./llm-spoglio-prompt";

describe("statusForConfidence", () => {
  it("maps high confidence (>= 0.8) to 'accepted'", () => {
    expect(statusForConfidence(0.8)).toBe("accepted");
    expect(statusForConfidence(0.95)).toBe("accepted");
    expect(statusForConfidence(1)).toBe("accepted");
  });

  it("maps mid confidence (0.5..0.79) to 'pending'", () => {
    expect(statusForConfidence(0.5)).toBe("pending");
    expect(statusForConfidence(0.65)).toBe("pending");
    expect(statusForConfidence(0.79)).toBe("pending");
  });

  it("rejects low confidence (< 0.5)", () => {
    expect(statusForConfidence(0.49)).toBeNull();
    expect(statusForConfidence(0.1)).toBeNull();
    expect(statusForConfidence(0)).toBeNull();
  });

  it("rejects non-finite values", () => {
    expect(statusForConfidence(NaN)).toBeNull();
    expect(statusForConfidence(Infinity)).toBeNull();
  });
});
