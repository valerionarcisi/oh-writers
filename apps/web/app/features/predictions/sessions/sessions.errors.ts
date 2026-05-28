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
