import { describe, it, expect } from "vitest";
import { buildCrossMatches } from "./cross-match";
import type {
  LocationRequirement,
  LocationCandidate,
} from "@oh-writers/domain";

const candidate = (
  id: string,
  name: string,
  address: string | null = null,
): LocationCandidate => ({
  id,
  requirementId: "owner",
  name,
  address,
  lat: null,
  lng: null,
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  estimatedDailyFee: null,
  permitRequired: null,
  permitNotes: null,
  availableFrom: null,
  availableTo: null,
  notes: null,
  status: "candidate",
  aiSuggested: false,
  aiReasoning: null,
  photos: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const requirement = (
  id: string,
  name: string,
  locationType: LocationRequirement["locationType"],
  candidates: LocationCandidate[],
  sceneCount = 1,
): LocationRequirement => ({
  id,
  projectId: "p",
  breakdownElementId: null,
  name,
  description: null,
  intExt: null,
  timeOfDay: [],
  locationType,
  locationTypeSource: locationType ? "haiku" : null,
  confirmedCandidateId: null,
  status: "pending",
  sceneCount,
  candidates,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("buildCrossMatches", () => {
  it("matches a restaurant candidate to another ristorante requirement", () => {
    const reqs = [
      requirement("r1", "Ristorante - Forno", "ristorante", [
        candidate("c1", "Trattoria da Gino"),
      ]),
      requirement("r2", "Sala", "ristorante", [], 3),
    ];
    const map = buildCrossMatches(reqs);
    const matches = map.get("c1") ?? [];
    expect(matches.map((m) => m.requirementId)).toEqual(["r2"]);
    expect(matches[0]!.sceneCount).toBe(3);
  });

  it("excludes the candidate's own requirement from its matches", () => {
    const reqs = [
      requirement("r1", "Ristorante", "ristorante", [
        candidate("c1", "Osteria del Borgo"),
      ]),
    ];
    expect(buildCrossMatches(reqs).has("c1")).toBe(false);
  });

  it("produces no entry when nothing else matches", () => {
    const reqs = [
      requirement("r1", "Spiaggia", "spiaggia", [
        candidate("c1", "Lido Azzurro"),
      ]),
      requirement("r2", "Ufficio", "ufficio", [], 2),
    ];
    expect(buildCrossMatches(reqs).has("c1")).toBe(false);
  });

  it("ignores requirements without a resolved location type", () => {
    const reqs = [
      requirement("r1", "Ristorante", "ristorante", [
        candidate("c1", "Trattoria Vecchia"),
      ]),
      requirement("r2", "Set misterioso", null, [], 5),
    ];
    expect(buildCrossMatches(reqs).has("c1")).toBe(false);
  });

  it("matches via address keyword when the name is generic", () => {
    const reqs = [
      requirement("r1", "Ristorante", "ristorante", [
        candidate("c1", "Locale", "Via della Trattoria 4"),
      ]),
      requirement("r2", "Cucina", "ristorante", [], 2),
    ];
    expect(buildCrossMatches(reqs).get("c1")?.length).toBe(1);
  });
});
