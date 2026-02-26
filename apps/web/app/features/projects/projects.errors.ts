/**
 * Plain value classes — not extending Error — so they serialize cleanly over
 * the JSON wire (createServerFn → client). Methods on Error (message, stack)
 * are non-enumerable and are lost in JSON round-trips; own properties are not.
 */

export class ProjectNotFoundError {
  readonly _tag = "ProjectNotFoundError" as const;
  readonly message: string;

  constructor(readonly id: string) {
    this.message = `Project not found: ${id}`;
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

  // dbCause stored as string so it survives JSON serialization
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

export type ProjectsError = ProjectNotFoundError | ForbiddenError | DbError;
