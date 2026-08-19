import type { UserId } from "@oh-writers/domain";
import { isAiEnabled, type AiSourceInput } from "@oh-writers/domain";
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
 * Spec 85 #2 — the DECISION moved to the pure `isAiEnabled` in
 * `@oh-writers/domain` (unit-tested there); this fn only gathers the I/O —
 * env reads, the BYOK provider lookup and the trial ledger — and reduces it
 * to an `AiSourceInput`. The decision order (override → mock → provider →
 * trial → env-key fallback) lives in the pure function.
 *
 * Narrow seam so the eventual provider/quota lookup (Spec 84 Wave 2, which
 * lives in `features/ai-providers/`) is a one-function change: swap the body,
 * keep the signature. `db` is threaded explicitly (not imported ambiently)
 * so this stays trivially testable without a real database.
 *
 * Fail-open on a DB error at every lookup: a broken provider/ledger query
 * must not itself hide every AI surface in the app — same fail-open contract
 * as `checkDailyBudget`/`recordAiUsage`/`checkTrialQuota` in features/ai.
 */
export async function resolveAiEnabled(
  userId: UserId,
  db: Db,
): Promise<boolean> {
  const input: AiSourceInput = {
    override: readAiEnabledTestOverride(),
    mockOn: process.env["MOCK_AI"] === "true",
    loadHasProvider: () => hasConnectedProvider(userId, db),
    loadTrialConfigured: () => isTrialQuotaConfigured(),
    loadTrialSpend: () => readTrialSpend(userId, db),
    allowanceEur: Number(process.env["AI_TRIAL_QUOTA_EUR"]),
    envKeyPresent: Boolean(process.env["ANTHROPIC_API_KEY"]),
  };
  return isAiEnabled(input);
}

const hasConnectedProvider = async (
  userId: UserId,
  db: Db,
): Promise<boolean> => {
  const { hasAiProviderForUser } =
    await import("~/features/ai-providers/ai-providers.server");
  return hasAiProviderForUser(userId, db).match(
    (has) => has,
    () => false,
  );
};

const isTrialQuotaConfigured = async (): Promise<boolean> => {
  const { isTrialQuotaEnabled } = await import("~/features/ai");
  // `raw > 0`, not mere env presence — matches the pre-Spec-85 chain so a
  // 0/negative/blank allowance stays OFF and the env-key fallback applies.
  return isTrialQuotaEnabled();
};

const readTrialSpend = async (userId: UserId, db: Db): Promise<number> => {
  const { isTrialQuotaEnabled, getUserTrialSpend } =
    await import("~/features/ai");
  if (!isTrialQuotaEnabled()) return 0;
  return getUserTrialSpend(userId, db).catch(() => 0);
};

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
