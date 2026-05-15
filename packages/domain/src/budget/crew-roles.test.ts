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

  it("forfait: fixed fee × fiscal multiplier, days and allowances ignored", () => {
    const total = resourceTotal({
      days: 10,
      dayRate: 4000,
      fiscalRegime: "privato",
      mealAllowance: 50,
      accommodation: 200,
      rateUnit: "forfait",
    });
    expect(total).toBe(4000 * 1.2);
  });

  it("forfait piva: no markup", () => {
    const total = resourceTotal({
      days: 5,
      dayRate: 2000,
      fiscalRegime: "piva",
      mealAllowance: 100,
      accommodation: 0,
      rateUnit: "forfait",
    });
    expect(total).toBe(2000);
  });

  it("posa: same formula as giornata, unit semantics are caller's responsibility", () => {
    const total = resourceTotal({
      days: 16,
      dayRate: 200,
      fiscalRegime: "piva",
      mealAllowance: 0,
      accommodation: 0,
      rateUnit: "posa",
    });
    expect(total).toBe(16 * 200);
  });
});
