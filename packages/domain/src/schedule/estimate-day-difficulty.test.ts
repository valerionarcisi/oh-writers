import { describe, it, expect } from "vitest";
import {
  estimateDayDifficulty,
  type DayInput,
  type DayInputStrip,
  type WeatherFactor,
} from "./estimate-day-difficulty.js";

const strip = (overrides: Partial<DayInputStrip> = {}): DayInputStrip => ({
  sceneNumber: 1,
  intExt: "INT",
  timeOfDay: "GIORNO",
  castCount: 2,
  hasVfx: false,
  hasSfx: false,
  locationName: "CUCINA",
  ...overrides,
});

const dayOf = (
  strips: DayInputStrip[],
  estimatedHours = 8,
): DayInput => ({ strips, estimatedHours });

describe("estimateDayDifficulty", () => {
  it("returns difficulty 1 for an all-interior day at high success", () => {
    const est = estimateDayDifficulty(
      dayOf([strip(), strip({ sceneNumber: 2, locationName: "CUCINA" })]),
      null,
    );
    expect(est.difficulty).toBe(1);
    expect(est.successProbabilityClear).toBeGreaterThanOrEqual(85);
    expect(est.successProbabilityActual).toBe(est.successProbabilityClear);
    expect(est.hasExterior).toBe(false);
    expect(est.weatherImpactPct).toBe(0);
  });

  it("escalates difficulty for exterior + night + SFX + many locations", () => {
    const est = estimateDayDifficulty(
      dayOf([
        strip({
          sceneNumber: 1,
          intExt: "EXT",
          timeOfDay: "NOTTE",
          locationName: "PIAZZA",
          hasSfx: true,
          castCount: 4,
        }),
        strip({
          sceneNumber: 2,
          intExt: "EXT",
          timeOfDay: "NOTTE",
          locationName: "VIA ROMA",
        }),
        strip({
          sceneNumber: 3,
          intExt: "EXT",
          timeOfDay: "NOTTE",
          locationName: "BAR",
        }),
      ]),
      null,
    );
    expect(est.difficulty).toBe(5);
    expect(est.riskFactors.some((r) => r.includes("location"))).toBe(true);
    expect(est.riskFactors.some((r) => r.includes("notturno"))).toBe(true);
    expect(est.riskFactors.some((r) => r.includes("VFX/SFX"))).toBe(true);
  });

  it("applies a weather penalty only when there is at least one exterior scene", () => {
    const allInteriorWithStorm = estimateDayDifficulty(
      dayOf([strip(), strip({ sceneNumber: 2 })]),
      {
        rainProbability: 95,
        windKmh: 20,
        tempMin: 10,
        tempMax: 18,
        conditions: "storm",
      } as WeatherFactor,
    );
    expect(allInteriorWithStorm.weatherImpactPct).toBe(0);
    expect(allInteriorWithStorm.successProbabilityActual).toBe(
      allInteriorWithStorm.successProbabilityClear,
    );
  });

  it("drops success probability sharply for storm on exterior day", () => {
    const est = estimateDayDifficulty(
      dayOf([
        strip({ sceneNumber: 1, intExt: "EXT", locationName: "SPIAGGIA" }),
      ]),
      {
        rainProbability: 90,
        windKmh: 30,
        tempMin: 12,
        tempMax: 20,
        conditions: "storm",
      },
    );
    expect(est.weatherImpactPct).toBe(-50);
    expect(est.successProbabilityClear - est.successProbabilityActual).toBe(50);
    expect(
      est.riskFactors.some((r) => r.toLowerCase().includes("temporale")),
    ).toBe(true);
    expect(
      est.recommendations.some((r) => r.toLowerCase().includes("cover set")),
    ).toBe(true);
  });

  it("flags moderate rain (40-69%) with a -20 penalty and a cover-set recommendation", () => {
    const est = estimateDayDifficulty(
      dayOf([
        strip({ sceneNumber: 1, intExt: "EXT", locationName: "PARCO" }),
      ]),
      {
        rainProbability: 55,
        windKmh: 20,
        tempMin: 10,
        tempMax: 22,
        conditions: "cloudy",
      },
    );
    expect(est.weatherImpactPct).toBe(-20);
    expect(
      est.riskFactors.some((r) => r.includes("pioggia 55%")),
    ).toBe(true);
    expect(
      est.recommendations.some((r) => r.toLowerCase().includes("cover set")),
    ).toBe(true);
  });

  it("flags a heavy day (>=11 hours) and recommends offloading scenes", () => {
    const est = estimateDayDifficulty(
      dayOf(
        [
          strip(),
          strip({ sceneNumber: 2 }),
          strip({ sceneNumber: 3 }),
        ],
        12,
      ),
      null,
    );
    expect(est.riskFactors.some((r) => r.includes("12.0h"))).toBe(true);
    expect(
      est.recommendations.some((r) => r.toLowerCase().includes("spostare")),
    ).toBe(true);
  });

  it("handles empty days gracefully", () => {
    const est = estimateDayDifficulty(dayOf([], 0), null);
    expect(est.difficulty).toBe(1);
    expect(est.successProbabilityClear).toBe(87);
    expect(est.riskFactors).toEqual([]);
    expect(est.hasExterior).toBe(false);
  });

  it("clamps probabilities between 0 and 100", () => {
    const est = estimateDayDifficulty(
      dayOf(
        [
          strip({
            sceneNumber: 1,
            intExt: "EXT",
            timeOfDay: "NOTTE",
            hasSfx: true,
            locationName: "TEATRO",
            castCount: 10,
          }),
          strip({
            sceneNumber: 2,
            intExt: "EXT",
            timeOfDay: "NOTTE",
            locationName: "PIAZZA",
          }),
          strip({
            sceneNumber: 3,
            intExt: "EXT",
            timeOfDay: "NOTTE",
            locationName: "VIA",
          }),
        ],
        14,
      ),
      {
        rainProbability: 90,
        windKmh: 60,
        tempMin: -5,
        tempMax: 5,
        conditions: "storm",
      },
    );
    expect(est.successProbabilityActual).toBeGreaterThanOrEqual(0);
    expect(est.successProbabilityActual).toBeLessThanOrEqual(100);
  });
});
