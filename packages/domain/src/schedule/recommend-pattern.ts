import type { PatternId } from "./coverage-patterns.js";

export interface BreakdownSummary {
  /** Names of characters that have at least one dialogue line in the scene. */
  castWithDialogue: string[];
  /** Count of breakdown elements categorized as "action" / stunts / SFX notes. */
  actionNoteCount: number;
}

export interface SceneForRecommend {
  pageStart: number | null;
  pageEnd: number | null;
  hasSpecialEffect: boolean;
}

const scenePageCount = (scene: SceneForRecommend): number => {
  if (
    scene.pageStart != null &&
    scene.pageEnd != null &&
    scene.pageEnd >= scene.pageStart
  ) {
    return scene.pageEnd - scene.pageStart;
  }
  return 1;
};

export const recommendPattern = (
  breakdown: BreakdownSummary | null,
  scene: SceneForRecommend,
): PatternId => {
  if (scene.hasSpecialEffect) return "action_handheld";
  if (!breakdown) return "master_plus_mids";
  if (breakdown.actionNoteCount > 0) return "action_handheld";

  const speakingChars = breakdown.castWithDialogue.length;
  const pageCount = scenePageCount(scene);

  if (pageCount < 1) return "master_only";
  if (speakingChars === 1) return "master_plus_mids";
  if (speakingChars === 2) return "shot_reverse_shot";
  if (speakingChars >= 3) return "three_way_dialogue";

  return "coverage_standard";
};
