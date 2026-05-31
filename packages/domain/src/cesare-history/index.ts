// packages/domain/src/cesare-history/index.ts
// Spec 51 — pure, DERIVED Cesare history markdown builders (changelog +
// transcript) and their input contracts. Framework-agnostic: no Effect, no
// Drizzle, no browser/Monaco. The data-loading that feeds these is the Effect
// loader in features/predictions.
export * from "./types.js";
export {
  buildEditChangelogMarkdown,
  buildEditChangelogListMarkdown,
} from "./changelog.js";
export { buildSessionTranscriptMarkdown } from "./transcript.js";
export {
  buildHistoryContextSummary,
  type HistorySummaryOptions,
} from "./context-summary.js";
