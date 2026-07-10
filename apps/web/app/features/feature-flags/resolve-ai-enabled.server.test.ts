import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Db } from "~/server/db";

// resolveAiEnabled's only external dependencies are `hasAiProviderForUser`
// (features/ai-providers) and `isTrialQuotaEnabled`/`getUserTrialSpend`
// (features/ai) — both lazily imported to keep this module out of the
// client bundle (see the file's own bundle-boundary comment). Mocked here so
// these tests exercise the resolver's OWN chain (test override / MOCK_AI /
// provider / trial / env-key fallback) without touching a real DB.

const hasAiProviderForUserMock = vi.fn();
vi.mock("~/features/ai-providers/ai-providers.server", () => ({
  hasAiProviderForUser: (...args: unknown[]) =>
    hasAiProviderForUserMock(...args),
}));

const isTrialQuotaEnabledMock = vi.fn();
const getUserTrialSpendMock = vi.fn();
vi.mock("~/features/ai/ai-usage.server", () => ({
  isTrialQuotaEnabled: () => isTrialQuotaEnabledMock(),
  getUserTrialSpend: (...args: unknown[]) => getUserTrialSpendMock(...args),
}));

const ok = <T>(value: T) => ({
  isOk: () => true,
  isErr: () => false,
  match: (onOk: (v: T) => unknown) => onOk(value),
});
const errResult = <E>(error: E) => ({
  isOk: () => false,
  isErr: () => true,
  match: (_onOk: unknown, onErr: (e: E) => unknown) => onErr(error),
});

const USER_ID = "11111111-1111-1111-1111-111111111111";
const FAKE_DB = {} as Db;

const ORIGINAL_MOCK_AI = process.env["MOCK_AI"];
const ORIGINAL_ANTHROPIC_KEY = process.env["ANTHROPIC_API_KEY"];
const ORIGINAL_TRIAL_QUOTA = process.env["AI_TRIAL_QUOTA_EUR"];

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env["MOCK_AI"];
  delete process.env["ANTHROPIC_API_KEY"];
  delete process.env["AI_TRIAL_QUOTA_EUR"];
  hasAiProviderForUserMock.mockReturnValue(ok(false));
  isTrialQuotaEnabledMock.mockReturnValue(false);
  getUserTrialSpendMock.mockResolvedValue(0);
});

afterEach(() => {
  if (ORIGINAL_MOCK_AI === undefined) delete process.env["MOCK_AI"];
  else process.env["MOCK_AI"] = ORIGINAL_MOCK_AI;
  if (ORIGINAL_ANTHROPIC_KEY === undefined) {
    delete process.env["ANTHROPIC_API_KEY"];
  } else {
    process.env["ANTHROPIC_API_KEY"] = ORIGINAL_ANTHROPIC_KEY;
  }
  if (ORIGINAL_TRIAL_QUOTA === undefined) {
    delete process.env["AI_TRIAL_QUOTA_EUR"];
  } else {
    process.env["AI_TRIAL_QUOTA_EUR"] = ORIGINAL_TRIAL_QUOTA;
  }
});

describe("resolveAiEnabled", () => {
  it("MOCK_AI=true short-circuits to true without touching provider/trial state", async () => {
    process.env["MOCK_AI"] = "true";
    const { resolveAiEnabled } = await import("./resolve-ai-enabled.server");

    const result = await resolveAiEnabled(USER_ID as never, FAKE_DB);

    expect(result).toBe(true);
    expect(hasAiProviderForUserMock).not.toHaveBeenCalled();
  });

  it("a connected provider always wins, even with the trial exhausted and no env key", async () => {
    hasAiProviderForUserMock.mockReturnValue(ok(true));
    isTrialQuotaEnabledMock.mockReturnValue(true);
    getUserTrialSpendMock.mockResolvedValue(999);
    const { resolveAiEnabled } = await import("./resolve-ai-enabled.server");

    const result = await resolveAiEnabled(USER_ID as never, FAKE_DB);

    expect(result).toBe(true);
    expect(getUserTrialSpendMock).not.toHaveBeenCalled();
  });

  it("no provider, trial flag OFF, no env key -> false", async () => {
    hasAiProviderForUserMock.mockReturnValue(ok(false));
    isTrialQuotaEnabledMock.mockReturnValue(false);
    const { resolveAiEnabled } = await import("./resolve-ai-enabled.server");

    const result = await resolveAiEnabled(USER_ID as never, FAKE_DB);

    expect(result).toBe(false);
  });

  it("no provider, trial flag OFF -> falls back to the env key (transitional)", async () => {
    hasAiProviderForUserMock.mockReturnValue(ok(false));
    isTrialQuotaEnabledMock.mockReturnValue(false);
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-platform-key";
    const { resolveAiEnabled } = await import("./resolve-ai-enabled.server");

    const result = await resolveAiEnabled(USER_ID as never, FAKE_DB);

    expect(result).toBe(true);
  });

  it("no provider, trial ON and under allowance -> true, env key never consulted", async () => {
    hasAiProviderForUserMock.mockReturnValue(ok(false));
    isTrialQuotaEnabledMock.mockReturnValue(true);
    getUserTrialSpendMock.mockResolvedValue(0.2);
    process.env["AI_TRIAL_QUOTA_EUR"] = "1";
    delete process.env["ANTHROPIC_API_KEY"];
    const { resolveAiEnabled } = await import("./resolve-ai-enabled.server");

    const result = await resolveAiEnabled(USER_ID as never, FAKE_DB);

    expect(result).toBe(true);
  });

  it("no provider, trial ON and exhausted -> false (de-platform: env key is retired once trial is configured)", async () => {
    hasAiProviderForUserMock.mockReturnValue(ok(false));
    isTrialQuotaEnabledMock.mockReturnValue(true);
    getUserTrialSpendMock.mockResolvedValue(1.5);
    process.env["AI_TRIAL_QUOTA_EUR"] = "1";
    // Even with a platform key configured, an exhausted trial must not
    // silently revive on it — that would defeat the de-platform checkpoint.
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-platform-key";
    const { resolveAiEnabled } = await import("./resolve-ai-enabled.server");

    const result = await resolveAiEnabled(USER_ID as never, FAKE_DB);

    expect(result).toBe(false);
  });

  it("fails open when getUserTrialSpend rejects (broken ledger never hides AI)", async () => {
    hasAiProviderForUserMock.mockReturnValue(ok(false));
    isTrialQuotaEnabledMock.mockReturnValue(true);
    getUserTrialSpendMock.mockRejectedValue(new Error("db down"));
    process.env["AI_TRIAL_QUOTA_EUR"] = "1";
    const { resolveAiEnabled } = await import("./resolve-ai-enabled.server");

    const result = await resolveAiEnabled(USER_ID as never, FAKE_DB);

    expect(result).toBe(true);
  });

  it("fails open when hasAiProviderForUser errors (falls through to the rest of the chain)", async () => {
    hasAiProviderForUserMock.mockReturnValue(
      errResult({ _tag: "DbError", message: "connection refused" }),
    );
    isTrialQuotaEnabledMock.mockReturnValue(false);
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-platform-key";
    const { resolveAiEnabled } = await import("./resolve-ai-enabled.server");

    const result = await resolveAiEnabled(USER_ID as never, FAKE_DB);

    expect(result).toBe(true);
  });
});
