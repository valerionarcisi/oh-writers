import { AsyncLocalStorage } from "node:async_hooks";
import type {
  IntentResult,
  VersionDirective,
} from "./cesare-intent-classifier";

// #119 — ambient turn-scoped signals from the intent classifier. The classified
// intent is produced by `resolveTurnPlan` while the skill registry (and every
// tool executor closure) is already being built in parallel, so threading it
// through ~7 factory signatures would churn the whole registry path. Instead it
// rides an AsyncLocalStorage cell, same two-step pattern as
// `ai-request-context.ts` (#120):
//   1. `openTurnSignalsScope()` runs synchronously at the turn handler's entry
//      (`handleAskCesareV2`), so the whole turn — tool loop included — inherits
//      the cell.
//   2. `setTurnClassifiedIntent()` mutates the cell when the classifier
//      resolves. `callCesareV2` awaits the turn plan BEFORE running the tool
//      loop, so every tool reads the final value — never a race.
// Readers get null when no classifier ran (non-classifier pages, MOCK_AI,
// classifier error) and fall back to their deterministic behaviour.

interface TurnSignalsCell {
  classifiedIntent: IntentResult | null;
}

const storage = new AsyncLocalStorage<TurnSignalsCell>();

export const openTurnSignalsScope = (): void => {
  storage.enterWith({ classifiedIntent: null });
};

export const setTurnClassifiedIntent = (intent: IntentResult): void => {
  const cell = storage.getStore();
  if (cell) cell.classifiedIntent = intent;
};

export const getTurnClassifiedIntent = (): IntentResult | null =>
  storage.getStore()?.classifiedIntent ?? null;

export const getTurnVersionDirective = (): VersionDirective | null =>
  getTurnClassifiedIntent()?.versionDirective ?? null;

// Test seam: run `fn` inside a fresh scope without relying on enterWith.
export const runWithTurnSignalsScope = <T>(fn: () => T): T =>
  storage.run({ classifiedIntent: null }, fn);
