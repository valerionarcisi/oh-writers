export class VersionNotFoundError {
  readonly _tag = "VersionNotFoundError" as const;
  readonly message: string;
  constructor(readonly id: string) {
    this.message = `Version not found: ${id}`;
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

export class InvalidLabelError {
  readonly _tag = "InvalidLabelError" as const;
  readonly message = "Label cannot be empty";
}
