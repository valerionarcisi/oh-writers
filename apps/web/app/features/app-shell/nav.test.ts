import { describe, expect, it } from "vitest";
import { Features, type Feature } from "@oh-writers/domain";
import { buildRailNav } from "./nav";

const t = (key: string) => key;

const ids = (
  enabledFeatures: ReadonlySet<Feature>,
): { sviluppo: string[]; produzione: string[] } => {
  const nav = buildRailNav({
    projectId: "p1",
    currentSegment: "",
    t,
    enabledFeatures,
  });
  return {
    sviluppo: nav.sviluppo.items.map((i) => i.id),
    produzione: nav.produzione.items.map((i) => i.id),
  };
};

describe("buildRailNav", () => {
  it("shows every entry when all features are enabled", () => {
    const enabledFeatures = new Set(Object.values(Features));
    const { sviluppo, produzione } = ids(enabledFeatures);
    expect(sviluppo).toEqual([
      "soggetto",
      "synopsis",
      "outline",
      "treatment",
      "screenplay",
    ]);
    expect(produzione).toEqual([
      "breakdown",
      "budget",
      "schedule",
      "locations",
      "shooting-plan",
    ]);
  });

  it("hides DEV_ONLY entries (Budget, Location, Piano di ripresa) when their feature is off", () => {
    const enabledFeatures = new Set<Feature>([
      Features.SOGGETTO,
      Features.SYNOPSIS,
      Features.OUTLINE,
      Features.TREATMENT,
      Features.SCREENPLAY,
      Features.BREAKDOWN,
      Features.SCHEDULE,
    ]);
    const { sviluppo, produzione } = ids(enabledFeatures);
    expect(sviluppo).toEqual([
      "soggetto",
      "synopsis",
      "outline",
      "treatment",
      "screenplay",
    ]);
    expect(produzione).toEqual(["breakdown", "schedule"]);
  });

  it("soggetto has no gateable feature — always shown even with an empty feature set", () => {
    const { sviluppo } = ids(new Set());
    expect(sviluppo).toEqual(["soggetto"]);
  });
});
