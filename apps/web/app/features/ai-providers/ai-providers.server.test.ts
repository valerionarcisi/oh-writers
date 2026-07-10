import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  saveAiProviderForUser,
  setAiProviderModelsForUser,
  getAiProviderStatusForUser,
  deleteAiProviderForUser,
  resolveAiProviderForUser,
  checkAiProviderCreditsForUser,
} from "./ai-providers.server";
import { encryptApiKey } from "./crypto.server";
import type { Db } from "~/server/db";

vi.mock("~/server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const USER_ID = "11111111-1111-1111-1111-111111111111";
const ORIGINAL_SECRET = process.env["AI_KEY_ENCRYPTION_SECRET"];

beforeEach(() => {
  process.env["AI_KEY_ENCRYPTION_SECRET"] = "test-secret-do-not-use-in-prod";
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env["AI_KEY_ENCRYPTION_SECRET"];
  } else {
    process.env["AI_KEY_ENCRYPTION_SECRET"] = ORIGINAL_SECRET;
  }
  vi.clearAllMocks();
});

// Minimal Drizzle query-builder stub: chainable methods that all resolve to
// `returnRows` (or run to completion for delete/update with no return).
const buildInsertDb = (returnRows: unknown[]) => {
  const chain = {
    values: vi.fn((_values: unknown) => chain),
    onConflictDoUpdate: vi.fn((_config: unknown) => chain),
    returning: vi.fn(() => Promise.resolve(returnRows)),
  };
  const db = { insert: vi.fn(() => chain) } as unknown as Db;
  return { db, chain };
};

const buildUpdateDb = (returnRows: unknown[]) => {
  const chain = {
    set: vi.fn((_values: unknown) => chain),
    where: vi.fn((_cond: unknown) => chain),
    returning: vi.fn(() => Promise.resolve(returnRows)),
  };
  const db = { update: vi.fn(() => chain) } as unknown as Db;
  return { db, chain };
};

const buildSelectDb = (row: unknown | undefined) => {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    then: (resolve: (rows: unknown[]) => unknown) =>
      Promise.resolve(row === undefined ? [] : [row]).then(resolve),
  };
  const db = { select: vi.fn(() => chain) } as unknown as Db;
  return { db, chain };
};

const buildDeleteDb = () => {
  const chain = { where: vi.fn(() => Promise.resolve(undefined)) };
  const db = { delete: vi.fn(() => chain) } as unknown as Db;
  return { db, chain };
};

describe("saveAiProviderForUser (upsert)", () => {
  it("encrypts the key and stores provider + last4 on first save", async () => {
    const { db, chain } = buildInsertDb([
      { provider: "openrouter", keyLast4: "3456", models: null },
    ]);

    const result = await saveAiProviderForUser(db, USER_ID, {
      provider: "openrouter",
      apiKey: "sk-or-v1-abc123456",
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual({
      provider: "openrouter",
      keyLast4: "3456",
      models: null,
    });

    const insertedValues = chain.values.mock.calls[0]![0] as {
      apiKeyEncrypted: string;
      userId: string;
    };
    expect(insertedValues.userId).toBe(USER_ID);
    expect(insertedValues.apiKeyEncrypted).not.toContain("sk-or-v1-abc123456");
  });

  it("second save replaces the first (onConflictDoUpdate targets userId)", async () => {
    const { db, chain } = buildInsertDb([
      { provider: "anthropic", keyLast4: "9999", models: null },
    ]);

    await saveAiProviderForUser(db, USER_ID, {
      provider: "anthropic",
      apiKey: "sk-ant-newkey9999",
    });

    expect(chain.onConflictDoUpdate).toHaveBeenCalledTimes(1);
    const conflictArgs = chain.onConflictDoUpdate.mock.calls[0]![0] as {
      target: unknown;
      set: { provider: string; keyLast4: string };
    };
    expect(conflictArgs.set.provider).toBe("anthropic");
    expect(conflictArgs.set.keyLast4).toBe("9999");
  });

  it("fails with a typed error, not a throw, when the encryption secret is missing", async () => {
    delete process.env["AI_KEY_ENCRYPTION_SECRET"];
    const { db } = buildInsertDb([]);

    const result = await saveAiProviderForUser(db, USER_ID, {
      provider: "openrouter",
      apiKey: "sk-or-v1-no-secret",
    });

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error._tag).toBe("AiProviderCryptoError");
  });
});

describe("setAiProviderModelsForUser", () => {
  it("updates only the models pair for the session user", async () => {
    const models = { fast: "some/fast-model", quality: "some/quality-model" };
    const { db, chain } = buildUpdateDb([
      { provider: "openrouter", keyLast4: "1234", models },
    ]);

    const result = await setAiProviderModelsForUser(db, USER_ID, models);

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.models).toEqual(models);
    expect(chain.set).toHaveBeenCalledWith(expect.objectContaining({ models }));
  });

  it("fails with a typed error when no row exists for the user (sad path)", async () => {
    const { db } = buildUpdateDb([]);

    const result = await setAiProviderModelsForUser(db, USER_ID, {
      fast: "x",
      quality: "y",
    });

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error._tag).toBe("AiProviderNotConfiguredError");
  });
});

describe("getAiProviderStatusForUser", () => {
  it("returns provider + last4 + models, never key material", async () => {
    const { db } = buildSelectDb({
      provider: "openrouter",
      keyLast4: "7890",
      models: null,
    });

    const result = await getAiProviderStatusForUser(db, USER_ID);

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual({
      provider: "openrouter",
      keyLast4: "7890",
      models: null,
    });
    expect(JSON.stringify(result.value)).not.toMatch(/sk-(or|ant)-/);
  });

  it("returns null when no provider is configured (sad path)", async () => {
    const { db } = buildSelectDb(undefined);

    const result = await getAiProviderStatusForUser(db, USER_ID);

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toBeNull();
  });

  it("never logs key material even though it never sees it (status query excludes it)", async () => {
    const { logger } = await import("~/server/logger");
    const { db } = buildSelectDb({
      provider: "anthropic",
      keyLast4: "4321",
      models: null,
    });

    await getAiProviderStatusForUser(db, USER_ID);

    const allLoggedArgs = [
      ...(logger.info as ReturnType<typeof vi.fn>).mock.calls,
      ...(logger.warn as ReturnType<typeof vi.fn>).mock.calls,
      ...(logger.error as ReturnType<typeof vi.fn>).mock.calls,
      ...(logger.debug as ReturnType<typeof vi.fn>).mock.calls,
    ];
    expect(JSON.stringify(allLoggedArgs)).not.toMatch(/sk-(or|ant)-/);
  });
});

describe("deleteAiProviderForUser", () => {
  it("removes the row for the session user", async () => {
    const { db, chain } = buildDeleteDb();

    const result = await deleteAiProviderForUser(db, USER_ID);

    expect(result.isOk()).toBe(true);
    expect(chain.where).toHaveBeenCalledTimes(1);
  });
});

describe("resolveAiProviderForUser (gateway-internal, Wave 2)", () => {
  it("returns the decrypted key alongside provider + models for the resolved user", async () => {
    const encrypted = encryptApiKey("sk-or-v1-gateway-secret");
    expect(encrypted.isOk()).toBe(true);
    if (!encrypted.isOk()) return;

    const { db } = buildSelectDb({
      provider: "openrouter",
      apiKeyEncrypted: encrypted.value,
      models: { fast: "h", quality: "s" },
    });

    const result = await resolveAiProviderForUser(USER_ID, db);

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual({
      provider: "openrouter",
      apiKey: "sk-or-v1-gateway-secret",
      models: { fast: "h", quality: "s" },
    });
  });

  it("fails with a typed AiProviderNotConfiguredError when the user has no row (sad path)", async () => {
    const { db } = buildSelectDb(undefined);

    const result = await resolveAiProviderForUser(USER_ID, db);

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error._tag).toBe("AiProviderNotConfiguredError");
  });

  it("fails with a typed crypto error when the stored ciphertext is corrupt", async () => {
    const { db } = buildSelectDb({
      provider: "anthropic",
      apiKeyEncrypted: "corrupt:not-valid:data",
      models: null,
    });

    const result = await resolveAiProviderForUser(USER_ID, db);

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error._tag).toBe("AiProviderCryptoError");
  });
});

describe("checkAiProviderCreditsForUser (Spec 84 §2.3 Step 3, Wave 3)", () => {
  const ORIGINAL_FETCH = global.fetch;

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  it("returns the remaining OpenRouter balance for a connected openrouter user", async () => {
    const encrypted = encryptApiKey("sk-or-v1-credit-check");
    expect(encrypted.isOk()).toBe(true);
    if (!encrypted.isOk()) return;

    const { db } = buildSelectDb({
      provider: "openrouter",
      apiKeyEncrypted: encrypted.value,
      models: null,
    });
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: { total_credits: 10, total_usage: 4 } }),
      ) as unknown as typeof fetch;

    const result = await checkAiProviderCreditsForUser(db, USER_ID);

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual({ provider: "openrouter", remaining: 6 });
    // The decrypted key must never leak into the returned shape.
    expect(JSON.stringify(result.value)).not.toMatch(/sk-or-v1-/);
  });

  it("returns a zero balance as a real zero, not an error (sad-balance path)", async () => {
    const encrypted = encryptApiKey("sk-or-v1-zero-balance");
    expect(encrypted.isOk()).toBe(true);
    if (!encrypted.isOk()) return;

    const { db } = buildSelectDb({
      provider: "openrouter",
      apiKeyEncrypted: encrypted.value,
      models: null,
    });
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: { total_credits: 5, total_usage: 5 } }),
      ) as unknown as typeof fetch;

    const result = await checkAiProviderCreditsForUser(db, USER_ID);

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual({ provider: "openrouter", remaining: 0 });
  });

  it("reports remaining: null for an anthropic provider (no balance endpoint)", async () => {
    const encrypted = encryptApiKey("sk-ant-credit-check");
    expect(encrypted.isOk()).toBe(true);
    if (!encrypted.isOk()) return;

    const { db } = buildSelectDb({
      provider: "anthropic",
      apiKeyEncrypted: encrypted.value,
      models: null,
    });
    global.fetch = vi.fn() as unknown as typeof fetch;

    const result = await checkAiProviderCreditsForUser(db, USER_ID);

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual({ provider: "anthropic", remaining: null });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("fails with a typed AiProviderNotConfiguredError when the user has no provider (sad path)", async () => {
    const { db } = buildSelectDb(undefined);

    const result = await checkAiProviderCreditsForUser(db, USER_ID);

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error._tag).toBe("AiProviderNotConfiguredError");
  });

  it("surfaces a typed OpenRouterApiError when the credits call fails (sad path)", async () => {
    const encrypted = encryptApiKey("sk-or-v1-revoked");
    expect(encrypted.isOk()).toBe(true);
    if (!encrypted.isOk()) return;

    const { db } = buildSelectDb({
      provider: "openrouter",
      apiKeyEncrypted: encrypted.value,
      models: null,
    });
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: "unauthorized" }, 401),
      ) as unknown as typeof fetch;

    const result = await checkAiProviderCreditsForUser(db, USER_ID);

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error._tag).toBe("OpenRouterApiError");
  });
});
