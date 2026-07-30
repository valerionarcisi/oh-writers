import { describe, it, expect } from "vitest";
import { ResultAsync } from "neverthrow";
import {
  openAiIdentityScope,
  setAiRequestIdentity,
  getAiRequestIdentity,
  runWithAiIdentityScope,
} from "./ai-request-context";
import type { Db } from "~/server/db";

const dbStub = { _tag: "dbStub" } as unknown as Db;

// Mirrors requireProjectAccess exactly: open the scope in the caller's
// SYNCHRONOUS frame, fill the cell from inside the returned promise chain.
const fakeRequireAccess = (userId: string): ResultAsync<string, never> => {
  openAiIdentityScope();
  return ResultAsync.fromSafePromise(Promise.resolve(userId)).map((id) => {
    setAiRequestIdentity({ userId: id, db: dbStub });
    return id;
  });
};

describe("ai-request-context (#120)", () => {
  // Declared FIRST on purpose: `enterWith` in later tests can bleed into the
  // runner's async frame, so the clean-context assertion must run before any
  // scope has ever been opened in this file.
  it("outside any scope, get returns null and set is a no-op", () => {
    setAiRequestIdentity({ userId: "ghost", db: dbStub });
    expect(getAiRequestIdentity()).toBeNull();
  });

  it("identity set inside the access chain is visible after the caller's await", async () => {
    const handler = async () => {
      await fakeRequireAccess("user-1");
      await Promise.resolve();
      return getAiRequestIdentity();
    };
    expect(await handler()).toEqual({ userId: "user-1", db: dbStub });
  });

  it("two interleaved requests never share a cell", async () => {
    const handler = async (userId: string, delayMs: number) => {
      await fakeRequireAccess(userId);
      await new Promise((r) => setTimeout(r, delayMs));
      return getAiRequestIdentity()?.userId;
    };
    const [a, b] = await Promise.all([
      handler("user-a", 20),
      handler("user-b", 5),
    ]);
    expect(a).toBe("user-a");
    expect(b).toBe("user-b");
  });

  it("fire-and-forget work forked from the request inherits the identity", async () => {
    let seenInBackground: string | undefined;
    const handler = async () => {
      await fakeRequireAccess("user-1");
      void (async () => {
        await Promise.resolve();
        seenInBackground = getAiRequestIdentity()?.userId;
      })();
    };
    await handler();
    await new Promise((r) => setTimeout(r, 0));
    expect(seenInBackground).toBe("user-1");
  });

  it("runWithAiIdentityScope isolates and restores the surrounding context", () => {
    const before = getAiRequestIdentity();
    runWithAiIdentityScope(() => {
      expect(getAiRequestIdentity()).toBeNull();
      setAiRequestIdentity({ userId: "scoped", db: dbStub });
      expect(getAiRequestIdentity()?.userId).toBe("scoped");
    });
    expect(getAiRequestIdentity()).toBe(before);
  });
});
