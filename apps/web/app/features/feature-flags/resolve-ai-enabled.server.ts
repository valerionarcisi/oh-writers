import type { UserId } from "@oh-writers/domain";

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
 * Spec 84 Wave 2 wires this to provider state + trial quota. For this wave it
 * always returns true (AI stays on) unless overridden by the dev/test-only
 * mock hook below, so the AI-off state is reachable in E2E without shipping
 * real provider/quota resolution yet.
 */
export async function resolveAiEnabled(
  userId: UserId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Spec 84 Wave 2 wires the real per-user lookup through `db`.
  db: unknown,
): Promise<boolean> {
  const override = readAiEnabledTestOverride();
  if (override !== null) return override;
  return true;
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
