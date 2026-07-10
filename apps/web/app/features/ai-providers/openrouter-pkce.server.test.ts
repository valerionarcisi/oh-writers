import { describe, it, expect } from "vitest";
import {
  generateVerifier,
  challengeS256,
  buildAuthUrl,
} from "./openrouter-pkce.server";

describe("PKCE helpers (Spec 84 §2.3, OHW-843)", () => {
  describe("generateVerifier", () => {
    it("produces a non-empty, URL-safe string", () => {
      const verifier = generateVerifier();
      expect(verifier.length).toBeGreaterThan(0);
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("produces a different verifier on each call", () => {
      const a = generateVerifier();
      const b = generateVerifier();
      expect(a).not.toBe(b);
    });

    it("produces at least 43 characters (RFC 7636 minimum verifier length)", () => {
      const verifier = generateVerifier();
      expect(verifier.length).toBeGreaterThanOrEqual(43);
    });
  });

  describe("challengeS256", () => {
    // RFC 7636 Appendix B known-answer test.
    it("matches the RFC 7636 Appendix B known-answer vector", () => {
      const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
      const expectedChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
      expect(challengeS256(verifier)).toBe(expectedChallenge);
    });

    it("is deterministic for the same verifier", () => {
      const verifier = generateVerifier();
      expect(challengeS256(verifier)).toBe(challengeS256(verifier));
    });

    it("produces a different challenge for a different verifier", () => {
      const a = challengeS256(generateVerifier());
      const b = challengeS256(generateVerifier());
      expect(a).not.toBe(b);
    });

    it("produces a URL-safe base64 string with no padding", () => {
      const challenge = challengeS256(generateVerifier());
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(challenge).not.toContain("=");
    });
  });

  describe("buildAuthUrl", () => {
    it("builds the OpenRouter /auth URL with callback_url, code_challenge, and S256 method", () => {
      const url = new URL(
        buildAuthUrl("https://app.example.com/callback", "abc123challenge"),
      );
      expect(url.origin + url.pathname).toBe("https://openrouter.ai/auth");
      expect(url.searchParams.get("callback_url")).toBe(
        "https://app.example.com/callback",
      );
      expect(url.searchParams.get("code_challenge")).toBe("abc123challenge");
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    });

    it("URL-encodes a callback URL with query params", () => {
      const url = new URL(
        buildAuthUrl("https://app.example.com/cb?x=1&y=2", "challenge"),
      );
      expect(url.searchParams.get("callback_url")).toBe(
        "https://app.example.com/cb?x=1&y=2",
      );
    });
  });
});
