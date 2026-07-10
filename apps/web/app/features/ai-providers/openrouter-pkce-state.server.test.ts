import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  packPkceState,
  unpackPkceState,
  buildPkceCookieHeader,
  buildPkceCookieClearHeader,
  readPkceCookie,
  OPENROUTER_PKCE_COOKIE,
  PKCE_STATE_TTL_MS,
} from "./openrouter-pkce-state.server";

const ORIGINAL_SECRET = process.env["AI_KEY_ENCRYPTION_SECRET"];
const USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";

describe("OpenRouter PKCE state cookie (Spec 84 §2.3, OHW-843)", () => {
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

  it("round-trips a verifier bound to a user through pack then unpack", () => {
    const now = Date.now();
    const packed = packPkceState(USER_ID, "verifier-value", now);
    expect(packed.isOk()).toBe(true);
    if (!packed.isOk()) return;

    const unpacked = unpackPkceState(packed.value, USER_ID, now + 1000);
    expect(unpacked.isOk()).toBe(true);
    if (!unpacked.isOk()) return;
    expect(unpacked.value).toBe("verifier-value");
  });

  it("fails with a typed error when the session user does not match the bound user", () => {
    const now = Date.now();
    const packed = packPkceState(USER_ID, "verifier-value", now);
    expect(packed.isOk()).toBe(true);
    if (!packed.isOk()) return;

    const unpacked = unpackPkceState(packed.value, OTHER_USER_ID, now + 1000);
    expect(unpacked.isErr()).toBe(true);
    if (!unpacked.isErr()) return;
    expect(unpacked.error._tag).toBe("PkceStateUserMismatchError");
  });

  it("fails with a typed error once the TTL has elapsed", () => {
    const now = Date.now();
    const packed = packPkceState(USER_ID, "verifier-value", now);
    expect(packed.isOk()).toBe(true);
    if (!packed.isOk()) return;

    const unpacked = unpackPkceState(
      packed.value,
      USER_ID,
      now + PKCE_STATE_TTL_MS + 1,
    );
    expect(unpacked.isErr()).toBe(true);
    if (!unpacked.isErr()) return;
    expect(unpacked.error._tag).toBe("PkceStateExpiredError");
  });

  it("fails with a typed error on a tampered cookie value", () => {
    const now = Date.now();
    const packed = packPkceState(USER_ID, "verifier-value", now);
    expect(packed.isOk()).toBe(true);
    if (!packed.isOk()) return;

    const [iv, ciphertext, authTag] = packed.value.split(":");
    if (!ciphertext) throw new Error("expected a ciphertext segment");
    // Flip a character in the middle of the ciphertext rather than appending
    // at the end — base64's trailing `=` padding makes appended garbage
    // silently ignored by Node's lenient decoder, which would decode back to
    // the SAME bytes and defeat the tamper.
    const midpoint = Math.floor(ciphertext.length / 2);
    const flippedChar = ciphertext[midpoint] === "A" ? "B" : "A";
    const tamperedCiphertext =
      ciphertext.slice(0, midpoint) +
      flippedChar +
      ciphertext.slice(midpoint + 1);
    const tampered = [iv, tamperedCiphertext, authTag].join(":");

    const unpacked = unpackPkceState(tampered, USER_ID, now);
    expect(unpacked.isErr()).toBe(true);
  });

  it("fails with a typed error on a malformed (non-packed) cookie value", () => {
    const unpacked = unpackPkceState(
      "not-a-valid-packed-string",
      USER_ID,
      Date.now(),
    );
    expect(unpacked.isErr()).toBe(true);
  });

  describe("cookie header helpers", () => {
    it("builds an HttpOnly, Secure, SameSite=Lax cookie header with the packed state", () => {
      const header = buildPkceCookieHeader("packed-value");
      expect(header).toContain(`${OPENROUTER_PKCE_COOKIE}=packed-value`);
      expect(header).toContain("HttpOnly");
      expect(header).toContain("Secure");
      expect(header).toContain("SameSite=Lax");
    });

    it("builds a clearing cookie header with Max-Age=0", () => {
      const header = buildPkceCookieClearHeader();
      expect(header).toContain(`${OPENROUTER_PKCE_COOKIE}=;`);
      expect(header).toContain("Max-Age=0");
    });

    it("reads the packed state back out of a raw Cookie header", () => {
      const header = buildPkceCookieHeader("packed-value");
      const cookieValue = header.split(";")[0] ?? "";
      expect(readPkceCookie(cookieValue)).toBe("packed-value");
    });

    it("reads the target cookie out of a multi-cookie header", () => {
      const raw = `other=1; ${OPENROUTER_PKCE_COOKIE}=packed-value; another=2`;
      expect(readPkceCookie(raw)).toBe("packed-value");
    });

    it("returns null when the cookie is absent", () => {
      expect(readPkceCookie("unrelated=1")).toBeNull();
      expect(readPkceCookie(null)).toBeNull();
    });
  });
});
