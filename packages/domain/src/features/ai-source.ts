// Pure `isAiEnabled` decision (Spec 85 #2) extracted from the web app's
// `resolve-ai-enabled.server.ts` (Spec 84 §5). This package stays
// framework-agnostic — no env reads, no imports of db/provider/better-auth, no
// lazy `import()` of ai-providers. The web fn injects the I/O as thunks — only
// the lookups the decision actually reaches are awaited (a mock/override never
// touches the provider or the trial ledger). Unit-tested here.

export interface AiSourceInput {
  /** Test/dev override — null when unset. Beats every other source. */
  readonly override: boolean | null;
  /** Mock mode is itself an AI source: the scripted mock client answers every call. */
  readonly mockOn: boolean;
  /** Loads whether a connected BYOK provider exists. */
  readonly loadHasProvider: () => Promise<boolean>;
  /** Loads the env flag — `AI_TRIAL_QUOTA_EUR` > 0. */
  readonly loadTrialConfigured: () => Promise<boolean>;
  /** Loads the per-user trial spend (EUR) — called only when trial is configured. */
  readonly loadTrialSpend: () => Promise<number>;
  /** The configured allowance (EUR). */
  readonly allowanceEur: number;
  /** `ANTHROPIC_API_KEY` present — used only when trial is unconfigured. */
  readonly envKeyPresent: boolean;
}

export const isAiEnabled = async (input: AiSourceInput): Promise<boolean> => {
  if (input.override !== null) return input.override;
  if (input.mockOn) return true;
  if (await input.loadHasProvider()) return true;
  if (await input.loadTrialConfigured()) {
    const spentEur = await input.loadTrialSpend();
    return spentEur < input.allowanceEur;
  }
  return input.envKeyPresent;
};
