// apps/web/app/features/predictions/sessions/sessions.errors.ts
// Spec 44 WP-B — Cesare session domain errors.
//
// `DbError` and access errors come from the shared utils package; the only
// session-specific error is "not found" by id, which both `rename` and
// `delete` need to short-circuit on before any FK-trigger fires.
import { DbError } from "@oh-writers/utils";

export { DbError };

export class CesareSessionNotFoundError {
  readonly _tag = "CesareSessionNotFoundError" as const;
  readonly message: string;
  constructor(readonly id: string) {
    this.message = `Cesare session not found: ${id}`;
  }
}

// Pin limit reached — the caller tried to pin a 4th session while 3 are
// already pinned for the project. Not a validation error: the request shape
// is valid, the domain rule (max 3 pinned per project) blocked it.
export class PinLimitReachedError {
  readonly _tag = "PinLimitReachedError" as const;
  readonly message: string;
  readonly limit: number;
  constructor(limit: number) {
    this.limit = limit;
    this.message = `Pin limit reached: at most ${limit} sessions can be pinned`;
  }
}
