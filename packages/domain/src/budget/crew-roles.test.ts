import { describe, it, expect } from "vitest";
import { CREW_ROLES, fiscalMultiplier, resourceTotal } from "./crew-roles";

describe("CREW_ROLES", () => {
  it("every role has a non-empty labelIt", () => {
    for (const role of CREW_ROLES) {
      expect(role.labelIt.length).toBeGreaterThan(0);
    }
  });

  it("every role has a non-empty department", () => {
    for (const role of CREW_ROLES) {
      expect(role.department.length).toBeGreaterThan(0);
    }
  });

  it("every role has a defaultDayRate > 0", () => {
    for (const role of CREW_ROLES) {
      expect(role.defaultDayRate).toBeGreaterThan(0);
    }
  });
});

describe("fiscalMultiplier", () => {
  it("returns 1.0 for piva", () => {
    expect(fiscalMultiplier("piva")).toBe(1.0);
  });

  it("returns 1.2 for privato", () => {
    expect(fiscalMultiplier("privato")).toBe(1.2);
  });

  it("returns 1.0 for none", () => {
    expect(fiscalMultiplier("none")).toBe(1.0);
  });
});

describe("resourceTotal", () => {
  const base = {
    days: 10,
    dayRate: 100,
    mealAllowance: 50,
    accommodation: 200,
  };

  it("piva: days × dayRate + allowances, no markup", () => {
    const total = resourceTotal({ ...base, fiscalRegime: "piva" });
    expect(total).toBe(10 * 100 * 1.0 + 50 + 200);
  });

  it("privato: days × dayRate × 1.2 + allowances", () => {
    const total = resourceTotal({ ...base, fiscalRegime: "privato" });
    expect(total).toBe(10 * 100 * 1.2 + 50 + 200);
  });

  it("none: same as piva (net)", () => {
    const total = resourceTotal({ ...base, fiscalRegime: "none" });
    expect(total).toBe(10 * 100 * 1.0 + 50 + 200);
  });

  it("zero days → only allowances", () => {
    const total = resourceTotal({
      ...base,
      days: 0,
      fiscalRegime: "privato",
    });
    expect(total).toBe(50 + 200);
  });

  it("zero allowances → only day total", () => {
    const total = resourceTotal({
      ...base,
      mealAllowance: 0,
      accommodation: 0,
      fiscalRegime: "piva",
    });
    expect(total).toBe(10 * 100);
  });
});
