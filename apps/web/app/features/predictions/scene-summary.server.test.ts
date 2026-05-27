import { describe, it, expect } from "vitest";
import { fingerprintBody } from "./scene-summary.server";

describe("[OHW-038e] scene-summary fingerprint", () => {
  it("produces a 16-char hex string", () => {
    const fp = fingerprintBody("INT. CUCINA - NOTTE\n\nDANTE\nGrida.");
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic for the same input", () => {
    const body = "INT. SALA - GIORNO\n\nFILIPPO\nEntra sorridendo.";
    expect(fingerprintBody(body)).toBe(fingerprintBody(body));
  });

  it("differs for different inputs", () => {
    const a = fingerprintBody("version A");
    const b = fingerprintBody("version B");
    expect(a).not.toBe(b);
  });

  it("differs for inputs with single character change (anti-stale guard)", () => {
    const base = "INT. BANCONE - GIORNO\nDANTE pulisce il bancone.";
    const modified = "INT. BANCONE - SERA\nDANTE pulisce il bancone.";
    expect(fingerprintBody(base)).not.toBe(fingerprintBody(modified));
  });

  it("handles empty string without throwing", () => {
    expect(() => fingerprintBody("")).not.toThrow();
    const fp = fingerprintBody("");
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });
});
