import { describe, expect, it } from "vitest";
import { isAiEnabled, type AiSourceInput } from "./ai-source.js";

const base = (over: Partial<AiSourceInput>): AiSourceInput => ({
  override: null,
  mockOn: false,
  loadHasProvider: async () => false,
  loadTrialConfigured: async () => false,
  loadTrialSpend: async () => 0,
  allowanceEur: 0,
  envKeyPresent: false,
  ...over,
});

describe("isAiEnabled (Spec 85 #2 — pure decision)", () => {
  it("test override beats everything, including mock, and skips I/O", async () => {
    const loadHasProvider = () => {
      throw new Error("must not be called");
    };
    expect(
      await isAiEnabled(
        base({ override: false, mockOn: true, loadHasProvider }),
      ),
    ).toBe(false);
    expect(await isAiEnabled(base({ override: true, loadHasProvider }))).toBe(
      true,
    );
  });

  it("mock mode is itself an AI source and never touches provider/trial", async () => {
    const loadHasProvider = () => {
      throw new Error("must not be called");
    };
    expect(await isAiEnabled(base({ mockOn: true, loadHasProvider }))).toBe(
      true,
    );
  });

  it("a connected provider always wins (trial not consulted)", async () => {
    const loadTrialSpend = () => {
      throw new Error("must not be called when a provider wins");
    };
    expect(
      await isAiEnabled(
        base({
          loadHasProvider: async () => true,
          loadTrialConfigured: async () => true,
          loadTrialSpend,
        }),
      ),
    ).toBe(true);
  });

  it("remaining trial quota enables (spent < allowance)", async () => {
    expect(
      await isAiEnabled(
        base({
          loadHasProvider: async () => false,
          loadTrialConfigured: async () => true,
          loadTrialSpend: async () => 0.4,
          allowanceEur: 1,
        }),
      ),
    ).toBe(true);
  });

  it("exhausted trial disables even when an env key is present (de-platform)", async () => {
    expect(
      await isAiEnabled(
        base({
          loadTrialConfigured: async () => true,
          loadTrialSpend: async () => 1.2,
          allowanceEur: 1,
          envKeyPresent: true,
        }),
      ),
    ).toBe(false);
  });

  it("trial unconfigured falls back to the env key", async () => {
    expect(await isAiEnabled(base({ envKeyPresent: true }))).toBe(true);
    expect(await isAiEnabled(base({ envKeyPresent: false }))).toBe(false);
  });

  it("trial configured to 0 allowance is OFF", async () => {
    expect(
      await isAiEnabled(
        base({
          loadTrialConfigured: async () => true,
          loadTrialSpend: async () => 0,
          allowanceEur: 0,
        }),
      ),
    ).toBe(false);
  });
});
