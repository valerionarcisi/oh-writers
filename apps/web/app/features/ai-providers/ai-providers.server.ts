import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { ResultAsync, ok, err } from "neverthrow";
import { toShape } from "@oh-writers/utils";
import { aiProviders } from "@oh-writers/db/schema";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import type { Db } from "~/server/db";
import { encryptApiKey, decryptApiKey } from "./crypto.server";
import {
  DbError,
  AiProviderCryptoError,
  AiProviderNotConfiguredError,
} from "./ai-providers.errors";

// Spec 84 §1 — account-level (not project-level) provider configuration: one
// row per user, resolved by session identity via `requireUser()`, the same
// pattern as features/user-settings/server/user-settings.server.ts. No
// `withProjectAccess` — there is no project in scope here.
//
// Core logic is exported as plain (db, userId, ...) functions, tested
// directly against a mocked Db — `createServerFn` handlers below are thin
// wrappers that resolve the session user and delegate, matching
// features/predictions/editorial-advice-decisions.server.ts.

const AiProviderEnum = z.enum(["openrouter", "anthropic"]);

// Spec 84 §3 — model IDs are never hardcoded: this schema only validates
// shape (two non-empty strings), it never supplies or suggests a default.
const AiProviderModelsSchema = z.object({
  haiku: z.string().min(1),
  sonnet: z.string().min(1),
});

export type AiProviderModels = z.infer<typeof AiProviderModelsSchema>;

const lastFour = (key: string): string => key.slice(-4);

export type SavedAiProvider = {
  readonly provider: "openrouter" | "anthropic";
  readonly keyLast4: string;
  readonly models: AiProviderModels | null;
};

// ─── Save (upsert) ──────────────────────────────────────────────────────────

const SaveAiProviderSchema = z.object({
  provider: AiProviderEnum,
  apiKey: z.string().min(1),
  models: AiProviderModelsSchema.nullable().optional(),
});

export const saveAiProviderForUser = (
  db: Db,
  userId: string,
  input: z.infer<typeof SaveAiProviderSchema>,
): ResultAsync<SavedAiProvider, DbError | AiProviderCryptoError> =>
  encryptApiKey(input.apiKey).asyncAndThen((apiKeyEncrypted) => {
    const models = input.models ?? null;
    return ResultAsync.fromPromise(
      db
        .insert(aiProviders)
        .values({
          userId,
          provider: input.provider,
          apiKeyEncrypted,
          keyLast4: lastFour(input.apiKey),
          models,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: aiProviders.userId,
          set: {
            provider: input.provider,
            apiKeyEncrypted,
            keyLast4: lastFour(input.apiKey),
            models,
            updatedAt: new Date(),
          },
        })
        .returning({
          provider: aiProviders.provider,
          keyLast4: aiProviders.keyLast4,
          models: aiProviders.models,
        }),
      (e) => new DbError("saveAiProvider", e),
    ).andThen((rows) => ok(rows[0]!));
  });

export const saveAiProvider = createServerFn({ method: "POST" })
  .validator(SaveAiProviderSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    return toShape(
      await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
        saveAiProviderForUser(db, user.id, data),
      ),
    );
  });

// ─── Update models only (wizard step 3) ────────────────────────────────────

const SetAiProviderModelsSchema = z.object({
  models: AiProviderModelsSchema,
});

export const setAiProviderModelsForUser = (
  db: Db,
  userId: string,
  models: AiProviderModels,
): ResultAsync<SavedAiProvider, DbError | AiProviderNotConfiguredError> =>
  ResultAsync.fromPromise(
    db
      .update(aiProviders)
      .set({ models, updatedAt: new Date() })
      .where(eq(aiProviders.userId, userId))
      .returning({
        provider: aiProviders.provider,
        keyLast4: aiProviders.keyLast4,
        models: aiProviders.models,
      }),
    (e) => new DbError("setAiProviderModels", e),
  ).andThen((rows) =>
    rows[0] ? ok(rows[0]) : err(new AiProviderNotConfiguredError(userId)),
  );

export const setAiProviderModels = createServerFn({ method: "POST" })
  .validator(SetAiProviderModelsSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    return toShape(
      await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
        setAiProviderModelsForUser(db, user.id, data.models),
      ),
    );
  });

// ─── Status (never returns key material) ───────────────────────────────────

export type AiProviderStatus = SavedAiProvider | null;

export const getAiProviderStatusForUser = (
  db: Db,
  userId: string,
): ResultAsync<AiProviderStatus, DbError> =>
  ResultAsync.fromPromise(
    db
      .select({
        provider: aiProviders.provider,
        keyLast4: aiProviders.keyLast4,
        models: aiProviders.models,
      })
      .from(aiProviders)
      .where(eq(aiProviders.userId, userId))
      .then((rows) => rows[0] ?? null),
    (e) => new DbError("getAiProviderStatus", e),
  ).andThen((row) => ok(row));

// Never returns key material — provider + last 4 chars + models only.
export const getAiProviderStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requireUser();
    return toShape(
      await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
        getAiProviderStatusForUser(db, user.id),
      ),
    );
  },
);

// ─── Delete ─────────────────────────────────────────────────────────────────

export const deleteAiProviderForUser = (
  db: Db,
  userId: string,
): ResultAsync<void, DbError> =>
  ResultAsync.fromPromise(
    db.delete(aiProviders).where(eq(aiProviders.userId, userId)),
    (e) => new DbError("deleteAiProvider", e),
  ).andThen(() => ok(undefined));

export const deleteAiProvider = createServerFn({ method: "POST" }).handler(
  async () => {
    const user = await requireUser();
    return toShape(
      await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
        deleteAiProviderForUser(db, user.id),
      ),
    );
  },
);

// ─── Gateway-internal resolution (Spec 83 Wave 2 consumes this) ───────────

export type ResolvedAiProvider = {
  readonly provider: "openrouter" | "anthropic";
  readonly apiKey: string;
  readonly models: AiProviderModels | null;
};

// SERVER-INTERNAL helper — NOT a createServerFn, never exposed to the
// client. Consumed by the Spec 83 gateway (Wave 2) to resolve per-user
// provider + decrypted credentials + model choice before a model call.
// Decryption happens here, at call time, per Spec 84 §4 — the decrypted key
// never crosses the createServerFn JSON boundary.
export const resolveAiProviderForUser = (
  userId: string,
  db: Db,
): ResultAsync<
  ResolvedAiProvider,
  DbError | AiProviderCryptoError | AiProviderNotConfiguredError
> =>
  ResultAsync.fromPromise(
    db
      .select({
        provider: aiProviders.provider,
        apiKeyEncrypted: aiProviders.apiKeyEncrypted,
        models: aiProviders.models,
      })
      .from(aiProviders)
      .where(eq(aiProviders.userId, userId))
      .then((rows) => rows[0] ?? null),
    (e) => new DbError("resolveAiProviderForUser", e),
  ).andThen((row) =>
    row
      ? decryptApiKey(row.apiKeyEncrypted).map((apiKey) => ({
          provider: row.provider,
          apiKey,
          models: row.models,
        }))
      : err(new AiProviderNotConfiguredError(userId)),
  );
