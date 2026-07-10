import { randomBytes, createHash } from "node:crypto";

// Spec 84 §2.3 Step 2 — OpenRouter's PKCE (S256) flow. Pure helpers, no I/O,
// so the exchange logic in the route handlers stays trivially testable.
// https://openrouter.ai/docs/guides/overview/auth/oauth

const VERIFIER_BYTES = 32; // 256 bits of entropy, base64url-encoded below
const OPENROUTER_AUTH_URL = "https://openrouter.ai/auth";

const base64url = (buf: Buffer): string =>
  buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export const generateVerifier = (): string =>
  base64url(randomBytes(VERIFIER_BYTES));

export const challengeS256 = (verifier: string): string =>
  base64url(createHash("sha256").update(verifier, "ascii").digest());

export const buildAuthUrl = (
  callbackUrl: string,
  challenge: string,
): string => {
  const url = new URL(OPENROUTER_AUTH_URL);
  url.searchParams.set("callback_url", callbackUrl);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
};
