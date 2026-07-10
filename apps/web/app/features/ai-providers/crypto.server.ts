import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { Result, ok, err } from "neverthrow";

// Spec 84 §4 — API keys are encrypted at rest with AES-256-GCM. Key material
// comes from AI_KEY_ENCRYPTION_SECRET (env), read lazily so a missing secret
// fails the specific call that needs it rather than crashing module load.
// node:crypto only — no new dependency for this.

export class AiProviderCryptoError {
  readonly _tag = "AiProviderCryptoError" as const;
  readonly message: string;

  constructor(readonly reason: string) {
    this.message = `AI provider crypto error: ${reason}`;
  }
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12; // GCM-recommended IV length
const PACKED_PARTS = 3; // iv:ciphertext:authTag

// AES-256-GCM needs exactly a 32-byte key. The env secret is an arbitrary
// string (e.g. `openssl rand -base64 32`, which decodes to 32 bytes but we
// must not assume the operator's encoding) — hash it to a fixed 32-byte
// digest so any non-empty secret is a valid key deterministically.
const deriveKey = (secret: string): Buffer =>
  createHash("sha256").update(secret, "utf8").digest();

const readEncryptionSecret = (): Result<string, AiProviderCryptoError> => {
  const secret = process.env["AI_KEY_ENCRYPTION_SECRET"];
  return secret
    ? ok(secret)
    : err(new AiProviderCryptoError("AI_KEY_ENCRYPTION_SECRET is not set"));
};

export const encryptApiKey = (
  plain: string,
): Result<string, AiProviderCryptoError> =>
  readEncryptionSecret().andThen((secret) => {
    const key = deriveKey(secret);
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plain, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return ok(
      [iv, ciphertext, authTag].map((buf) => buf.toString("base64")).join(":"),
    );
  });

export const decryptApiKey = (
  packed: string,
): Result<string, AiProviderCryptoError> =>
  readEncryptionSecret().andThen((secret) => {
    const parts = packed.split(":");
    if (parts.length !== PACKED_PARTS)
      return err(new AiProviderCryptoError("malformed ciphertext"));

    const [ivPart, ciphertextPart, authTagPart] = parts as [
      string,
      string,
      string,
    ];
    const key = deriveKey(secret);
    const iv = Buffer.from(ivPart, "base64");
    const ciphertext = Buffer.from(ciphertextPart, "base64");
    const authTag = Buffer.from(authTagPart, "base64");

    return Result.fromThrowable(
      () => {
        const decipher = createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        return Buffer.concat([
          decipher.update(ciphertext),
          decipher.final(),
        ]).toString("utf8");
      },
      () =>
        new AiProviderCryptoError(
          "decryption failed: tampered or corrupt ciphertext",
        ),
    )();
  });
