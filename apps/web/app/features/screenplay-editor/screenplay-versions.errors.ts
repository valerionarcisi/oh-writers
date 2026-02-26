/**
 * Plain value classes — not extending Error — so they serialize cleanly over
 * the JSON wire (createServerFn → client). Methods on Error (message, stack)
 * are non-enumerable and are lost in JSON round-trips; own properties are not.
 */

export class VersionNotFoundError {
  readonly _tag = "VersionNotFoundError" as const;
  readonly message: string;

  constructor(readonly id: string) {
    this.message = `Version not found: ${id}`;
  }
}

export class CannotDeleteLastManualError {
  readonly _tag = "CannotDeleteLastManualError" as const;
  readonly message: string;

  constructor() {
    this.message = "Cannot delete the only manual version";
  }
}

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

export type VersionsError =
  | VersionNotFoundError
  | CannotDeleteLastManualError
  | ForbiddenError
  | DbError;
