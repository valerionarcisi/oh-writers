import { describe, it, expect } from "vitest";
import { mockRankPlaces, type RankablePlace } from "./rank.fixtures";

const trattoria: RankablePlace = {
  placeId: "trattoria",
  name: "Trattoria del Cerchio",
  types: ["restaurant"],
  rating: 3.9,
  priceLevel: "PRICE_LEVEL_INEXPENSIVE",
  editorialSummary: "Trattoria casalinga e informale",
};
const stellato: RankablePlace = {
  placeId: "stellato",
  name: "Ristorante Stellato",
  types: ["restaurant"],
  rating: 4.8,
  priceLevel: "PRICE_LEVEL_EXPENSIVE",
  editorialSummary: "Locale elegante, atmosfera raffinata e luci soffuse",
};
const quietBar: RankablePlace = {
  placeId: "quiet",
  name: "Bar Centrale",
  types: ["bar"],
  rating: 3.8,
  priceLevel: null,
  editorialSummary: "Bar tranquillo di quartiere",
};
const livePub: RankablePlace = {
  placeId: "live",
  name: "Pub Live",
  types: ["pub", "bar"],
  rating: 4.5,
  priceLevel: null,
  editorialSummary: "Pub con palco e serate di musica dal vivo",
};

// OHW-380 — the mock ranker sorts by scene mood, not just rating.
describe("mockRankPlaces", () => {
  it("ranks the upscale place first for a horror/tense scene", () => {
    const ranked = mockRankPlaces("INT. RISTORANTE - NOTTE horror teso", [
      trattoria,
      stellato,
    ]);
    expect(ranked[0]!.placeId).toBe("stellato");
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  it("ranks the live-music place first for an open-mic scene", () => {
    const ranked = mockRankPlaces("INT. PUB - SERA serata open mic", [
      quietBar,
      livePub,
    ]);
    expect(ranked[0]!.placeId).toBe("live");
  });

  it("attaches a non-empty reason to each place", () => {
    const ranked = mockRankPlaces("horror", [trattoria, stellato]);
    expect(ranked.every((r) => r.reason.length > 0)).toBe(true);
  });

  it("falls back to rating order for a neutral scene", () => {
    const ranked = mockRankPlaces("INT. STANZA - GIORNO", [
      trattoria,
      stellato,
    ]);
    // stellato has the higher rating (4.8 vs 3.9)
    expect(ranked[0]!.placeId).toBe("stellato");
  });

  it("returns one verdict per place", () => {
    const ranked = mockRankPlaces("scena", [trattoria, stellato, quietBar]);
    expect(ranked).toHaveLength(3);
  });
});
