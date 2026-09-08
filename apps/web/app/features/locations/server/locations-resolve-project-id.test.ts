import { describe, it, expect, vi } from "vitest";
import { DbError } from "@oh-writers/utils";
import type { Db } from "~/server/db";
import { projectIdFromCandidate } from "./locations.server";
import { LocationCandidateNotFoundError } from "../locations.errors";

const PROJECT = "00000000-0000-4000-a000-000000000001";

// #160 — mirrors shooting-plan/server/resolve-project-id.test.ts: the join
// resolver must derive the real owning projectId from the candidate row
// rather than the mutating handlers trusting a client-declared projectId.
const dbReturning = (rows: unknown[]): Db => {
  const chain: Record<string, unknown> = {};
  chain["select"] = vi.fn(() => chain);
  chain["from"] = vi.fn(() => chain);
  chain["innerJoin"] = vi.fn(() => chain);
  chain["where"] = vi.fn(() => Promise.resolve(rows));
  return chain as unknown as Db;
};

describe("projectIdFromCandidate", () => {
  it("joins candidate → requirement → projectId", async () => {
    const r = await projectIdFromCandidate(
      dbReturning([{ projectId: PROJECT }]),
      "candidate-1",
    );
    expect(r.isOk() && r.value).toBe(PROJECT);
  });

  it("an unknown candidate resolves to LocationCandidateNotFoundError, never a projectId", async () => {
    const r = await projectIdFromCandidate(dbReturning([]), "ghost-candidate");
    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error).toBeInstanceOf(LocationCandidateNotFoundError);
    }
  });

  it("a DB failure surfaces as DbError, not silently swallowed", async () => {
    const db = {
      select: vi.fn(() => db),
      from: vi.fn(() => db),
      innerJoin: vi.fn(() => db),
      where: vi.fn(() => Promise.reject(new Error("connection lost"))),
    } as unknown as Db;
    const r = await projectIdFromCandidate(db, "candidate-1");
    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error).toBeInstanceOf(DbError);
    }
  });
});
