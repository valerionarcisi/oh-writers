import { AsyncLocalStorage } from "node:async_hooks";
import type { Db } from "~/server/db";

// #120 — ambient per-request AI identity. Any `callHaiku`/`streamGeneration`
// without explicit BYOK params used to silently hit the PLATFORM Anthropic key
// (401 in dev, platform-billed in prod). Instead of threading `userId`/`db`
// through every tool signature, the identity is published once at the access
// boundary (`requireProjectAccess`) and read by the AI gateway as a default.
//
// Two-step ALS pattern, because `requireProjectAccess` RETURNS access rather
// than wrapping the handler:
//   1. `openAiIdentityScope()` runs SYNCHRONOUSLY at the boundary's entry via
//      `enterWith`, so the caller's whole async continuation (everything after
//      `await requireProjectAccess(...)`, including fire-and-forget background
//      effects forked from it) inherits an empty per-request cell.
//   2. `setAiRequestIdentity()` later MUTATES that shared cell from inside the
//      access-resolution promise chain — mutation is visible across the async
//      graph even though `enterWith` there would not be.
// Requests never share a cell: each gets its own async context chain.

export interface AiRequestIdentity {
  readonly userId: string;
  readonly db: Db;
}

interface IdentityCell {
  current: AiRequestIdentity | null;
}

const storage = new AsyncLocalStorage<IdentityCell>();

export const openAiIdentityScope = (): void => {
  storage.enterWith({ current: null });
};

export const setAiRequestIdentity = (identity: AiRequestIdentity): void => {
  const cell = storage.getStore();
  if (cell) cell.current = identity;
};

export const getAiRequestIdentity = (): AiRequestIdentity | null =>
  storage.getStore()?.current ?? null;

// Test seam: run `fn` inside a fresh scope without relying on enterWith.
export const runWithAiIdentityScope = <T>(fn: () => T): T =>
  storage.run({ current: null }, fn);
