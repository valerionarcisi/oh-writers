import { Result, ok, err } from "neverthrow";
import {
  encryptApiKey,
  decryptApiKey,
  AiProviderCryptoError,
} from "./crypto.server";

// Spec 84 §2.3 Step 3 — the code_verifier must be held server-side, bound to
// the requesting user, for the short window between `/start` and
// `/callback`. No cookie/session-state utility exists in this repo yet (see
// spec research); an httpOnly signed cookie is the documented fallback. We
// reuse `AI_KEY_ENCRYPTION_SECRET` (already required) and the existing
// AES-256-GCM helper from crypto.server.ts instead of inventing a second
// secret or a new table — the payload is opaque and short-lived, so a plain
// encrypted cookie value is enough: tampering fails AEAD decryption, and the
// callback re-checks the bound userId against the session before using it.

export const OPENROUTER_PKCE_COOKIE = "ohw_openrouter_pkce";
export const PKCE_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export type PkceState = {
  readonly userId: string;
  readonly verifier: string;
  readonly expiresAt: number; // epoch ms
};

export class PkceStateExpiredError {
  readonly _tag = "PkceStateExpiredError" as const;
  readonly message = "OpenRouter connection expired, please retry";
}

export class PkceStateUserMismatchError {
  readonly _tag = "PkceStateUserMismatchError" as const;
  readonly message = "OpenRouter connection does not belong to this session";
}

export class PkceStateMissingError {
  readonly _tag = "PkceStateMissingError" as const;
  readonly message = "No pending OpenRouter connection found";
}

export type PkceStateError =
  | AiProviderCryptoError
  | PkceStateExpiredError
  | PkceStateUserMismatchError
  | PkceStateMissingError;

export const packPkceState = (
  userId: string,
  verifier: string,
  now: number,
): Result<string, AiProviderCryptoError> =>
  encryptApiKey(
    JSON.stringify({
      userId,
      verifier,
      expiresAt: now + PKCE_STATE_TTL_MS,
    } satisfies PkceState),
  );

export const unpackPkceState = (
  packed: string,
  expectedUserId: string,
  now: number,
): Result<string, PkceStateError> =>
  decryptApiKey(packed).andThen((json) => {
    const parsed = Result.fromThrowable(
      () => JSON.parse(json) as PkceState,
      () => new PkceStateMissingError(),
    )();
    return parsed.andThen((state) => {
      if (state.userId !== expectedUserId)
        return err(new PkceStateUserMismatchError());
      if (state.expiresAt < now) return err(new PkceStateExpiredError());
      return ok(state.verifier);
    });
  });

export const buildPkceCookieHeader = (packedState: string): string =>
  `${OPENROUTER_PKCE_COOKIE}=${packedState}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${
    PKCE_STATE_TTL_MS / 1000
  }`;

export const buildPkceCookieClearHeader = (): string =>
  `${OPENROUTER_PKCE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export const readPkceCookie = (cookieHeader: string | null): string | null => {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === OPENROUTER_PKCE_COOKIE) return rest.join("=");
  }
  return null;
};
