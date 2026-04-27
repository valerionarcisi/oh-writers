// Shared error classes — used across all features.
// Domain-specific errors (ProjectNotFoundError, VersionNotFoundError, etc.)
// stay in their feature's errors.ts file.
//
// Plain value classes — not extending Error — so they serialize cleanly over
// the JSON wire (createServerFn → client). Methods on Error (message, stack)
// are non-enumerable and are lost in JSON round-trips; own properties are not.

export class ForbiddenError {
  readonly _tag = "ForbiddenError" as const;
  readonly message: string;

  constructor(readonly action: string) {
    this.message = `Forbidden: ${action}`;
  }
}

export class DbError {
  readonly _tag = "DbError" as const;
  readonly message: string;
  readonly dbCause: string | null;

  constructor(
    readonly operation: string,
    cause: unknown,
  ) {
    this.message = `DB error in ${operation}`;
    this.dbCause =
      cause instanceof Error ? cause.message : String(cause ?? null);
  }
}

// Cross-cutting rate-limit signal. Emitted by the shared rate-limit helper
// (apps/web/app/server/rate-limit.ts) and rendered uniformly by
// ResultErrorView. Features that want a distinct UX can .mapErr to a
// feature-tagged variant, but by default the generic tag is enough — the
// retry copy is identical across the product.
export class RateLimitedError {
  readonly _tag = "RateLimitedError" as const;
  readonly message = "Rate limited: try again shortly";

  constructor(readonly retryAfterMs: number) {}
}

// Input that passes Zod shape validation but violates a domain-level
// constraint (length cap depending on discriminator, business-rule limit, etc.)
// that Zod alone cannot express without refetching DB state.
export class ValidationError {
  readonly _tag = "ValidationError" as const;
  readonly message: string;

  constructor(
    readonly field: string,
    readonly reason: string,
  ) {
    this.message = `Validation failed on ${field}: ${reason}`;
  }
}
