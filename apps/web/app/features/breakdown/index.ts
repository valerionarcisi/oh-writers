export {
  getBreakdownForScene,
  getBreakdownContext,
  getProjectBreakdown,
  getProjectBreakdownRows,
  getStaleScenes,
  addBreakdownElement,
  updateBreakdownElement,
  archiveBreakdownElement,
  setOccurrenceStatus,
  type SceneOccurrenceWithElement,
  type ProjectBreakdownRow,
  type BreakdownContext,
  type BreakdownSceneSummary,
} from "./server/breakdown.server";
export {
  suggestBreakdownForScene,
  type SuggestResult,
} from "./server/cesare-suggest.server";
export {
  runAutoSpoglioForScene,
  runAutoSpoglioForVersion,
  type AutoSpoglioResult,
  type AutoSpoglioVersionResult,
} from "./server/auto-spoglio.server";
export {
  streamFullSpoglio,
  getSpoglioProgress,
  type StreamFullSpoglioResult,
  type SpoglioProgress,
} from "./server/llm-spoglio.server";
export { cloneBreakdownToVersion } from "./server/clone-version.server";
export { exportBreakdownPdf, exportBreakdownCsv } from "./server/export.server";
export {
  canEditBreakdown,
  canViewBreakdown,
  type BreakdownPermissionContext,
} from "./lib/permissions";
export { BreakdownPage } from "./components/BreakdownPage";
export { staleScenesOptions } from "./hooks/useBreakdown";
export { findElementInText } from "./lib/re-match";
