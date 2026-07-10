import type { UserId } from "@oh-writers/domain";
import type { Db } from "~/server/db";

// ⚠️ Bundle-boundary rule (live regression, gate 2026-07-10): this module is
// imported by the root-route server fn, whose file is reachable from the
// client graph. `ai-providers.server` drags better-auth server context and
// the db module — it must load LAZILY inside the function, never statically,
// or the client bundle wedges at module init.

/**
 * Spec 84 §5 — resolves whether the given user currently has a working AI
 * source (connected BYOK provider OR remaining onboarding trial quota).
 * `Features.AI_ENABLED` is OFF exactly when this returns false, hiding every
 * AI surface app-wide behind the single "Attiva l'AI" banner.
 *
 * Narrow seam so the eventual provider/quota lookup (Spec 84 Wave 2, which
 * lives in `features/ai-providers/`) is a one-function change: swap the body,
 * keep the signature. `db` is threaded explicitly (not imported ambiently)
 * so this stays trivially testable without a real database.
 *
 * Spec 84 Wave 2 (this change): TRUE when the user has a saved provider row
 * (`hasAiProviderForUser` — cheap exists-query, no decryption), OR — the
 * transitional de-platform-checkpoint fallback, same rationale as the
 * gateway's own platform fallback in `features/ai/model-resolver.server.ts`
 * — the platform's own Anthropic key is configured. Onboarding trial quota
 * (`Features.AiTrialQuota`) is a separate, not-yet-built OR-branch; it is
 * NOT this wave's concern (this function's own OR clause already covers
 * "there is a working AI source" for the platform-fallback period).
 * Fail-open on a DB error: a broken provider lookup must not itself hide
 * every AI surface in the app — same fail-open contract as
 * `checkDailyBudget`/`recordAiUsage` in features/ai.
 */
export async function resolveAiEnabled(
  userId: UserId,
  db: Db,
): Promise<boolean> {
  const override = readAiEnabledTestOverride();
  if (override !== null) return override;

  // Mock mode IS an AI source: the scripted mock client answers every AI
  // call, so the surfaces must stay on in dev/E2E even when the environment
  // has no real key (CI never sets ANTHROPIC_API_KEY). The test override
  // above still wins, so the AI-off E2E can force OFF under mock.
  if (process.env["MOCK_AI"] === "true") return true;

  const { hasAiProviderForUser } =
    await import("~/features/ai-providers/ai-providers.server");
  const hasProvider = await hasAiProviderForUser(userId, db).match(
    (has) => has,
    () => false,
  );
  if (hasProvider) return true;

  // Spec 84 de-platform checkpoint removes this default once trial quota ships.
  return Boolean(process.env["ANTHROPIC_API_KEY"]);
}

/**
 * Test/dev-only override, gated the same way as `POST /api/test/mock-context`
 * (`apps/web/app/routes/api/test/mock-context.ts`): settable only through a
 * route that 404s unless `process.env.MOCK_AI === "true"`. Never reachable in
 * a production build (the setter route itself disappears outside mock mode),
 * so this can't leak into a real deployment.
 *
 * Stored in `process.env` rather than a module-level `let`: this file is
 * pulled into TWO separate server bundles under vinxi/TanStack Start —
 * the `/api/test/set-ai-enabled` API route and the `resolveAiEnabledForCurrentUser`
 * `createServerFn` are each compiled as isolated server entries, so a plain
 * module-level variable would be two independent instances that never see
 * each other's writes (confirmed by a failing E2E run before this fix).
 * `process.env` is the one thing genuinely shared across all of them within
 * the same Node process.
 */
const AI_ENABLED_OVERRIDE_ENV_VAR = "__OHW_TEST_AI_ENABLED_OVERRIDE__";

export function setAiEnabledOverrideForTests(value: boolean | null): void {
  if (value === null) {
    delete process.env[AI_ENABLED_OVERRIDE_ENV_VAR];
  } else {
    process.env[AI_ENABLED_OVERRIDE_ENV_VAR] = String(value);
  }
}

function readAiEnabledTestOverride(): boolean | null {
  const raw = process.env[AI_ENABLED_OVERRIDE_ENV_VAR];
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}
