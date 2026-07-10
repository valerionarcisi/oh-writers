import { DbError } from "@oh-writers/utils";
export { DbError };
export { AiProviderCryptoError } from "./crypto.server";

// Spec 84 §6 — "errors out of existence": a missing/invalid config is a
// typed condition the caller matches on, never a thrown exception or a
// silent fallback to the platform key.
export class AiProviderNotConfiguredError {
  readonly _tag = "AiProviderNotConfiguredError" as const;
  readonly message: string;

  constructor(readonly userId: string) {
    this.message = `No AI provider configured for user ${userId}`;
  }
}
