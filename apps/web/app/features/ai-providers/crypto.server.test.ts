import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptApiKey, decryptApiKey } from "./crypto.server";

const ORIGINAL_SECRET = process.env["AI_KEY_ENCRYPTION_SECRET"];

describe("AI provider key encryption (Spec 84 §4)", () => {
  beforeEach(() => {
    process.env["AI_KEY_ENCRYPTION_SECRET"] = "test-secret-do-not-use-in-prod";
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete process.env["AI_KEY_ENCRYPTION_SECRET"];
    } else {
      process.env["AI_KEY_ENCRYPTION_SECRET"] = ORIGINAL_SECRET;
    }
  });

  it("round-trips a plaintext API key through encrypt then decrypt", () => {
    const plain = "sk-or-v1-abc123def456";
    const encrypted = encryptApiKey(plain);
    expect(encrypted.isOk()).toBe(true);
    if (!encrypted.isOk()) return;

    const decrypted = decryptApiKey(encrypted.value);
    expect(decrypted.isOk()).toBe(true);
    if (!decrypted.isOk()) return;
    expect(decrypted.value).toBe(plain);
  });

  it("produces ciphertext that never contains the plaintext key", () => {
    const plain = "sk-or-v1-super-secret-value";
    const encrypted = encryptApiKey(plain);
    expect(encrypted.isOk()).toBe(true);
    if (!encrypted.isOk()) return;
    expect(encrypted.value).not.toContain(plain);
  });

  it("produces a different ciphertext on each call (random IV)", () => {
    const plain = "sk-or-v1-same-key-twice";
    const first = encryptApiKey(plain);
    const second = encryptApiKey(plain);
    expect(first.isOk() && second.isOk()).toBe(true);
    if (!first.isOk() || !second.isOk()) return;
    expect(first.value).not.toBe(second.value);
  });

  it("fails with a typed error, not a throw, when ciphertext is tampered with", () => {
    const encrypted = encryptApiKey("sk-or-v1-tamper-me");
    expect(encrypted.isOk()).toBe(true);
    if (!encrypted.isOk()) return;

    const [iv, ciphertext, authTag] = encrypted.value.split(":");
    const tampered = [iv, `${ciphertext}AA`, authTag].join(":");

    expect(() => decryptApiKey(tampered)).not.toThrow();
    const result = decryptApiKey(tampered);
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error._tag).toBe("AiProviderCryptoError");
  });

  it("fails with a typed error on malformed (non-packed) ciphertext", () => {
    const result = decryptApiKey("not-a-valid-packed-string");
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error._tag).toBe("AiProviderCryptoError");
  });

  it("fails to encrypt with a typed error when AI_KEY_ENCRYPTION_SECRET is missing", () => {
    delete process.env["AI_KEY_ENCRYPTION_SECRET"];
    const result = encryptApiKey("sk-or-v1-no-secret");
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error._tag).toBe("AiProviderCryptoError");
    expect(result.error.message).toContain("AI_KEY_ENCRYPTION_SECRET");
  });

  it("fails to decrypt with a typed error when AI_KEY_ENCRYPTION_SECRET is missing", () => {
    const encrypted = encryptApiKey("sk-or-v1-round-trip-then-lose-secret");
    expect(encrypted.isOk()).toBe(true);
    if (!encrypted.isOk()) return;

    delete process.env["AI_KEY_ENCRYPTION_SECRET"];
    const result = decryptApiKey(encrypted.value);
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error._tag).toBe("AiProviderCryptoError");
  });

  it("fails to decrypt with a different (wrong) secret than the one used to encrypt", () => {
    const encrypted = encryptApiKey("sk-or-v1-wrong-secret-test");
    expect(encrypted.isOk()).toBe(true);
    if (!encrypted.isOk()) return;

    process.env["AI_KEY_ENCRYPTION_SECRET"] = "a-completely-different-secret";
    const result = decryptApiKey(encrypted.value);
    expect(result.isErr()).toBe(true);
  });
});
