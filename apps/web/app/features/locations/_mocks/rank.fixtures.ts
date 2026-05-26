import type { RankVerdict } from "../locations.schema";

/**
 * Deterministic MOCK_AI ranking (spec 37c). A tiny heuristic stands in for
 * Cesare's atmosphere judgement so the E2E is deterministic:
 *  - upscale signals (high rating, expensive, "elegante"/"raffinato"/"stellato")
 *    rank high for a tense/dramatic scene;
 *  - live-music signals ("palco", "musica dal vivo", "live") rank high for an
 *    open-mic/energetic scene;
 *  - otherwise score by rating.
 * The real ranker (Haiku) replaces this when MOCK_AI is off.
 */
export interface RankablePlace {
  readonly placeId: string;
  readonly name: string;
  readonly types: readonly string[];
  readonly rating: number | null;
  readonly priceLevel: string | null;
  readonly editorialSummary: string | null;
}

const fold = (s: string): string => s.toLowerCase();

const UPSCALE = ["elegant", "raffinat", "stellat", "soffus", "lusso"];
const LIVE = ["palco", "musica dal vivo", "live", "open mic", "concert"];

const sceneWantsLive = (sceneText: string): boolean =>
  LIVE.some((w) => fold(sceneText).includes(w));

const sceneWantsUpscale = (sceneText: string): boolean =>
  ["horror", "teso", "elegante", "thriller", "dramma", "cena"].some((w) =>
    fold(sceneText).includes(w),
  );

export const mockRankPlaces = (
  sceneText: string,
  places: readonly RankablePlace[],
): RankVerdict[] => {
  const wantsLive = sceneWantsLive(sceneText);
  const wantsUpscale = sceneWantsUpscale(sceneText);

  return places
    .map((p): RankVerdict => {
      const blurb = fold(`${p.name} ${p.editorialSummary ?? ""}`);
      const ratingScore = (p.rating ?? 3) / 5;
      let score = ratingScore * 0.5;
      let reason = `Valutazione ${p.rating ?? "n/d"}`;

      if (wantsLive && LIVE.some((w) => blurb.includes(w))) {
        score = 0.95;
        reason = "Ha un palco / musica dal vivo — adatto alla serata open mic";
      } else if (
        wantsUpscale &&
        (UPSCALE.some((w) => blurb.includes(w)) ||
          p.priceLevel === "PRICE_LEVEL_EXPENSIVE")
      ) {
        score = 0.92;
        reason = "Locale elegante e raffinato — adatto al tono della scena";
      }

      return { placeId: p.placeId, score, reason };
    })
    .sort((a, b) => b.score - a.score);
};
